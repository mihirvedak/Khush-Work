# 07 - Data Model, Dummy Data & Generator

Types live in `seed-data/types.ts`; the generator in `seed-data/generator.ts` (zero
dependencies, deterministic). Pre-computed JSON slices live in `seed-data/sample/`.
**The UI must import the generator, not the 5 MB JSON**, except for quick
static mock-ups.

## 1. Why a generator and not a static JSON

| Option | Verdict |
|---|---|
| Hand-written JSON | Rejected. Not internally consistent (OEE != A x P x Q, events overlap, batches don't join). Clients spot this in 30 s. |
| Static exported JSON only | OK for Figma / screenshots. Too heavy for 1 Hz series (30 d x 90 tags = 230 M points). |
| **Seeded generator (chosen)** | Events, batches, quality, logbooks and escalations are materialised once (~160 ms). Time-series values are **computed on demand** by `valueAt()` from the asset state + batch phase at that instant, so charts can ask for any window at any resolution with zero storage. Same seed = same demo every time. |

## 2. Generator API

```ts
// ALWAYS import from index.ts - it runs the generator and then enrichLogbooks() from forms.ts
import { buildDataset, getSeries, valueAt, eventAt, computeOee,
         capability, goldenTunnel, shiftOf, reasonLabel,
         ASSETS, TAGS, REASONS, PEOPLE, FORMS, formByNo } from './data/index';

const ds = buildDataset();   // seed 2609, 30 days, now 2026-09-22 16:20 ET, memoised
```

| Function | Returns | Used by |
|---|---|---|
| `buildDataset(opts)` (index.ts) | `DemoDataset` (assets, tags, reasons, batches, events, qualityLosses, deviations, logbookTemplates, logbookEntries, escalations) | App bootstrap - build once, keep in a Zustand store |
| `eventAt(ds, assetId, t)` | `StateEvent` covering `t` (binary search, O(log n)) | Tooltips, live tiles, SPC steady-state filter |
| `valueAt(ds, assetId, tagKey, t)` | number, physics-shaped by state + phase | Live tiles |
| `getSeries(ds, assetId, tagKey, from, to, stepSec)` | `{ t: number[], v: number[] }` | Trends, SPC, golden tunnel overlay. Keep points <= 5,000 per series - pick `stepSec` from the window (24 h -> 60 s, 7 d -> 300 s, 30 d -> 900 s). |
| `computeOee(ds, { assetIds, from, to, shift? })` | `{ availability, performance, quality, oee, teep, hours:{calendar,noSched,planned,unplanned,run}, kg:{total,good} }` | OEE module, Overview tiles. A x P x Q = OEE by construction. |
| `capability(values, lsl?, usl?, n=1)` | `{ n, mean, sigmaWithin, sigmaOverall, cp, cpk, pp, ppk, indicative, ucl, lcl }` (`null` where one-sided or n<10) | SPC tab |
| `goldenTunnel(ds, assetPrefix, tagKey, points)` | `{ status:'ok'|'insufficient', n, batchIds, x:%phase, median[], lo[], hi[] }` | Golden Tunnel tab |
| `shiftOf(t)` | `'A'|'B'` using America/New_York wall-clock | Everywhere |

Rules for the app layer:

- Build the dataset once in a Web Worker if first paint budget is tight; otherwise at module load is fine (~160 ms).
- Never mutate `ds` from UI code. Operator actions (tag a reason, sign a form, acknowledge an escalation) go into a separate `overlay` slice in Zustand keyed by entity id, and selectors merge `ds` + `overlay`. Reset button clears overlay -> demo is repeatable.
- "Live" feel: a 5 s ticker advances a `demoNow` offset; ongoing events (`end === null`) extend to `demoNow`; `valueAt` is sampled at `demoNow`. Do not regenerate the dataset.

## 3. Entity shapes (summary - see types.ts for full)

| Entity | Key fields | Count (seed 2609, 30 d) |
|---|---|---|
| Asset | id, name, line, area, stage, kind (`continuous`/`batch`/`cyclic`/`drying`), isConstraint, phases[], record (form no), targets | 23 |
| TagDef | assetId, key, label, unit, **source**, **dataStateToday**, sampleSec, target/lsl/usl, **demoLimit**, spc, golden, critical | ~90 |
| Reason | code, category P/E/R/M/U/Q/H/X, group, label, lines, weight, medianMin | ~55 + U000 |
| Batch | OBX genealogy id, assetId, start/end, inputKg, outputKg, **goodKg**, theoreticalKg, firstPass, **parentIds**, phases[], metrics{} | ~838 |
| StateEvent | id, assetId, state, start, end (null = Ongoing), batchId, phase, product, reasonCode, taggedBy/At, detectedBy, expectedQty, actualQty, backfilled, remarks | ~10.5 k |
| QualityLoss | id, batchId, reasonCode QL1-/QL2-, qtyKg, disposition, recoveredKg, status, raisedBy, dispositionedBy | ~85 |
| Deviation | id, tagKey, limitType, limit, worst, severity, status, escalationLevel, linkedDowntimeId | ~42 |
| LogbookEntry | id, formNo, assetId, batchId, shift, dueAt, submittedAt, status, operator/reviewer/approver, fields[] `{key,label,value,unit,source,outOfLimit,section,row}` - keys match `FORMS` in forms.ts exactly, corrections[] | 678 across 14 forms |
| Escalation | id, trigger, entityId, levelReached, startedAt, ackAt, ackBy, notified[], slaMet | ~920 |

All timestamps are **epoch ms UTC** in memory; the sample JSON serialises them as ISO-8601 `Z`. Render with `date-fns-tz` in `America/New_York`.

## 4. ID formats (preserve OBX batch identity - hard rule 5)

| Object | Format | Example | Note |
|---|---|---|---|
| Kratom extraction cycle | `KX-Tnn-YYMMDD-n` | `KX-T01-260822-1` | one per tank cycle |
| LLE run | `LLE-YYMMDD-n` | `LLE-260822-1` | |
| Solvent recovery run | `SRU-YYMMDD-n` | `SRU-260822-1` | |
| Crystallization batch | `MCB-26-nnnn` | `MCB-26-0160` | Stands in for the Cloud SQL batch id. In a real build this is **read** from OBX, never minted. |
| Freebase filter/dry | `MFD-26-nnnn` | `MFD-26-0150` | |
| Acetate salt run | `MAS-26-nnnn` | `MAS-26-0052` | |
| Salt dryer lot | `MSD-26-nnnn` | `MSD-26-0050` | |
| 1M / 2M WFE campaign | `1M-YYMMDD-nn` / `2M-YYMMDD-nn` | `2M-260920-01` | continuous campaign, may span days |
| Isolation crash | `ISO-X-YYMMDD-nn-Cn` | `ISO-C-260921-02-C1` | reactor letter + crash no. (FOR-BIP-004 allows up to 4 crashes) |
| Delta-8 reaction | `D8-YYMMDD-nn` | `D8-260823-02` | shared sequence across RXN-1 / RXN-3 |
| Buchner / wash | `BUF-YYMMDD-nn` | `BUF-260823-01` | |
| Vacuum oven load | `VOn-YYMMDD-nn` | `VO1-260823-01` | |
| State event | `EV-Ln-nnnnnn` | `EV-L2-010510` | UI shows as `DT-L2-nnnnnn` in the Downtime Logger (same number) |
| Quality loss | `QL-Ln-nnnnn` | `QL-L1-00001` | |
| Deviation | `DEV-Ln-nnnn` | `DEV-L2-0133` | |
| Logbook entry | `LB-nnnnnn` | `LB-000078` | form no. carried separately (`FOR-BIP-009`) |
| Escalation | `ESC-nnnnn` | `ESC-00214` | |

Every ID in the UI is a link to its entity drawer; genealogy (`parentIds`) is walkable both directions.

## 5. How realism was engineered

- **State placement**: planned phases from ISA-88 phase lists; unplanned stops by Poisson process per asset with reason-weighted rates and log-normal durations around each reason's `medianMin`; continuous WFEs get micro-stops (feed interruptions 10-120 s); NOSCH nights/weekend gaps on L1 outdoor pad per weather; contiguity guaranteed (no gaps, no overlaps, min 10 s).
- **Signals** (`valueAt`): each asset family has a physics shape - WFE vacuum pull-down and leak ramp during E1xx stops; ISO internal temp exponential crash with per-batch tau (slow tau = ISO-C story); RXN exotherm (peak 8-14 degC over set in 3-8 min) then cook band 85-95 degC; CRY pH ramp with dose-rate and CRY-02 probe offset drift; EXT tank fill/soak/recirc/drain levels. Gaussian noise + slow wander; shift-B set-point bias on WFE-2M evaporator.
- **Quality**: mass-based. `goodKg` = first-pass good mass; quality losses carry `qtyKg` + disposition; rework mass counts against the originating asset (hard rule 2: yield is shown **beside** OEE, never inside it).
- **Logbooks** (built by `enrichLogbooks` in forms.ts, schema in `09-form-schema.md`): FOR-BIP-009/010 every 2 h during campaign with values pulled from `valueAt` at due time (auto-fill, source = Controller) and operator initials (Manual); batch forms on batch close; daily equipment checks - one missed on shift B = the vacuum-pump-oil story.
- **Escalations**: derived from events and deviations by the matrix in `06`; SLA met/missed computed from ack time.

## 6. Injected stories (the demo script depends on these - do not "fix")

| # | Story | Where it shows |
|---|---|---|
| S1 | **L2-WFE-2M DOWN since 07:42 ET**, reason E102 "Pump oil degraded", tagged by J. Alvarez 07:55, remark "Vacuum 0.184 mbar and rising. Pump oil dark - maintenance called." `end = null` | Overview banner, Timeline "Ongoing" chip, Downtime Logger open item, escalation L2 |
| S2 | **Untagged stop on L1-LLE-01 13:31-14:05** (`U000`, detected "Auto: flow = 0") | Timeline "1 untagged" header, tag-now demo |
| S3 | **Outdoor-pad DISC 24 min, back-filled** on L1-EXT-T01..T04 (`backfilled: true`, X201) | Timeline hatched bar + "Back-filled from edge buffer" badge - answers pre-read question on edge buffering |
| S4 | **ISO-C live slow crash** - batch `ISO-C-2609xx-..` in CRASH phase leaving the golden tunnel; Major deviation DEV-L2-0133 (Golden, T_INT) acknowledged by R. Ellis | Process Parameters live + Golden Tunnel + Deviation Log |
| S5 | Shift B WFE-2M OEE 45.8 % vs A 54.3 % (vacuum pump oil check missed on B daily checklist) | OEE shift comparison -> LOG-EQ-DAILY overdue entries |
| S6 | CRY-02 quality below CRY-01 (pH probe drift, E401 events, Ppk 0.52 indicative) | OEE asset drill, SPC Rule 3 trend, calibration log |
| S7 | Heptane loss split LLE 38 / SRU 27 / FIL 21 / unaccounted 14 % | Solvent Balance tab Sankey |

## 7. Calibrated outputs (seed 2609, 30 d ending 2026-09-22 16:20 ET)

OEE (%) - from `sample/oee_summary_30d.json`:

| Asset | OEE | Shift A | Shift B | | Asset | OEE | Shift A | Shift B |
|---|---|---|---|---|---|---|---|---|
| L1-EXT-T01 | 69.4 | 69.7 | 69.2 | | **L2-WFE-2M** (constraint) | **49.8** | 54.3 | 45.8 |
| L1-LLE-01 | 58.1 | 59.3 | 57.0 | | L2-WFE-1M | 68.3 | 67.0 | 69.5 |
| L1-SRU-01 | 71.2 | 73.7 | 68.9 | | L2-ISO-A / B / C / D / E | 66.7 / 65.9 / 54.9 / 73.0 / 64.8 | | |
| **L1-CRY-01** (constraint) | 61.9 | 63.0 | 59.1 | | L2-RXN-1 / RXN-3 | 61.7 / 53.1 | | |
| **L1-CRY-02** (constraint) | 55.9 | 42.3 | 55.8 | | L2-BUF-01 | 71.3 | | |
| L1-FIL-01 / SLT-01 / SDR-01 | 67.6 / 73.3 / 76.4 | | | | L2-VO-01 / 02 | 77.9 / 81.0 | | |

WFE-2M breakdown: A 67.6 %, P 81.2 %, Q 90.7 %; 469 run h, 225 unplanned h, 26 planned h.
Capability: see `05` story table (values generated, not typed).
Downtime Pareto: see `01` "Demo Pareto shape".

If you change the seed or reason weights, re-run the export and update these tables - the talk track quotes them.

## 8. Sample files (`seed-data/sample/`)

| File | Size | Content |
|---|---|---|
| `dataset_30d.json` | ~4.9 MB | Full materialised dataset (no time-series) with ISO timestamps |
| `timeline_L2-WFE-2M_last24h.json` | 9 KB | 22 events incl. ongoing S1 |
| `oee_summary_30d.json` | 5 KB | A/P/Q/OEE + shift split + hours + kg per asset |
| `series_samples.json` | ~1 MB | WFE-2M 24 h (6 tags, 60 s), ISO-C live batch, last RXN-1 batch (10 s), CRY-02 48 h, EXT-T01 24 h |
| `golden_tunnel_ISO_T_INT.json` | 22 KB | Tunnel median/lo/hi vs % phase + contributing batch ids |
| `capability_snapshot.json` | 2 KB | 8 capability studies |
| `downtime_pareto_30d.json` | 2 KB | Top-12 reasons per line |
| `open_items_now.json` | 38 KB | Ongoing events, open deviations, holds, due/overdue logbooks at demo "now" |

Regenerate: `npx tsx export-samples.ts` (run from `seed-data/`).

## 9. Moving from demo to real (architecture note for the talk track)

| Demo object | Real source at OBX | Integration |
|---|---|---|
| Batch ids L1 | Cloud SQL Postgres genealogy | Read-only replica / CDC -> Unified Data Fabric; Faclon attaches process history by id |
| Batch ids L2 | Paper BPR -> Faclon eBPR (Quality-controlled template) | eBPR becomes the record; identity scheme agreed with OBX Quality |
| Tags L1 upstream | Beckhoff TwinCAT (ADS / OPC UA) via I/O Connect edge on outdoor pad with local buffer | Read-only |
| Tags L2 | VFDs / controllers (Modbus RTU/TCP) + new transmitters where DS4 | Read-only |
| Quality | HPLC exports / COA PDFs | File drop or LIMS API -> linked by batch id |
| ERP | Acumatica REST | Read in Phase 1; write-back deferred |

## 9. Form schema and logbook entries

`seed-data/forms.ts` holds `FORMS: FormDef[]` - 14 forms, every section (incl. repeating blocks: 2-hour checks, crashes 1-4, washes 1-3), every field (type, capture, source badge, unit, limits, OBX limitRef, rule, options, appliesTo, editableBy), sign-off chain, blocking rules and escalation. Human-readable catalog: `references/09-form-schema.md`. Entry counts (last 7-10 days): FOR-KRT-101 86, FOR-BIP-009 81, FOR-BIP-010 80, LOG-CLEAN 68, FOR-KRT-102 39, FOR-KRT-103 35, FOR-BIP-003 30, LOG-SHIFT 28, FOR-BIP-004 26, FOR-KRT-105 23, FOR-KRT-104 20, LOG-EQ-DAILY 145, LOG-CAL 10, LOG-SOLV 7.

Stories carried by the forms: FOR-BIP-010 checks during the E102 vacuum downtime are out-of-limit with deviation DEV + downtime link in EXCEPTIONS; LOG-EQ-DAILY vacuum-pump-oil check missed on WFE-2M shift B for 3 days; LOG-CAL L1-CRY-02.PH as-found FAIL (10.19 vs 10.01) explains CRY-02 final-pH deviations; ISO-C live batch has REACHED_M18 empty and a slow-crash note; LOG-SHIFT L2 current shift carries the handover note about E102 and ISO-C.
