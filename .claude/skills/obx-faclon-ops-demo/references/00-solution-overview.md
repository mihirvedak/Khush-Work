# 00 - Solution Overview (read first)

## 1. Problem understanding

OBX (Open Book Extracts, Roxboro NC) runs two manufacturing areas at very different digital maturity:

| | L1 Kratom / MIT | L2 Bulk Cannabinoids |
|---|---|---|
| Process | Continuous-batch extraction -> batch crystallization -> freebase -> acetate salt | Batch WFE distillation -> CBD isolation **or** Delta-8 reaction -> wash / dry |
| Record today | Tablet apps on Cloud Run + Cloud SQL genealogy (strong) | Controlled paper BPRs (FOR-BIP-009/010/004/003) |
| Telemetry | Beckhoff PLC + HMI upstream, history not retained; local controllers downstream | Local controllers, VFDs, gauges, chillers; 2-hour paper snapshots |
| Their question | "Where is heptane lost, and what is solvent loss per kg of finished MIT?" | "Which WFE operating conditions are associated with yield or quality variation?" |

OBX explicitly said: **trusted, contextualised data first; AI later**, and "more data collected" is not a success metric. The demo must therefore sell *outcomes on their data model*, not dashboards for their own sake.

## 2. Critical evaluation of the brief (read before building)

| Brief item | Risk if built literally | What we do instead |
|---|---|---|
| "OEE" on a batch chemical plant | Discrete-style OEE (parts/min, micro-stops of 10 s) looks naive to a chemist; the Hamilton template shows 10-second micro-stops which do not exist on a reactor | **Batch-aware OEE** (ideal batch cycle time, kg-based rate for WFE), micro-stop only enabled on WFE feed/wiper (threshold 5 min). Yield shown next to OEE, never inside it |
| "Rejection logger" | Chemical batches are rarely "rejected" - they are held, reworked (re-distilled, re-crystallised, re-washed) or downgraded | Rejection logger = **Quality Loss & Disposition logger**: Hold / Rework / Downgrade / Scrap with kg, reason, lab result link |
| "SPC Cp/Cpk" on 20 batches | Cpk on < 25-30 subgroups is statistically weak; per-batch endpoints are one value per batch | Show **Ppk (overall)** by default for batch endpoints, Cp/Cpk for continuous WFE signals with rational subgroups; confidence badge "n = 18 - indicative" when n < 30 |
| "Golden tunnel" | A time-based band is wrong when batches run at different speeds | Golden tunnel on **phase-aligned time** (per ISA-88 phase), built from top-quartile batches by yield + purity |
| Logbooks as generic forms | OBX Quality controls these templates; a generic form builder undermines trust | Render the **actual FOR-BIP forms** field-for-field, with revision number, auto-populated equipment fields and operator attestation fields |
| Two separate lines | Separate apps would duplicate genealogy | One hierarchy (ISA-95): Site -> Area -> Line -> Unit Operation -> Equipment -> Tag, one batch identity from OBX |

## 3. Information architecture (left nav, I/O Sense shell)

```
Roxboro Site (header switcher: Site > Line > Asset, date range, shift)
|-- Overview            Plant command view: both lines, live state, today's OEE, open deviations, open logbook tasks
|-- Machine Timeline    Per asset / per line swim-lanes, event table (02)
|-- Downtime Logger     Event list, reason tagging, Pareto, MTTR/MTBF (03)
|-- Quality Loss Logger Holds / rework / downgrade / scrap, shift-wise (03)
|-- OEE                 Plant > Line > Asset > Batch drill, loss waterfall, shift compare (04)
|-- Process Parameters  Live tags, SPC charts, Cp/Cpk/Ppk, golden tunnel, deviation log (05)
|-- Logbooks            Form library, shift / day / batch entries, review & approval, escalation (06)
|-- Batch Genealogy     Lot -> tote -> batch -> drum -> salt run (L1); crude -> 1M -> 2M -> ISO/RXN -> dry (L2)
`-- Settings            Reason trees, limits, shifts, escalation matrix, users & roles (admin only)
```

Global filter bar (sticky): `Line` (All / L1 Kratom-MIT / L2 Bulk) - `Asset` (multi) - `Shift` (All / A / B) - `Date range` (Today, Yesterday, Last 7 d, Last 30 d, Custom) - `Batch / Lot` search. Filters persist across modules (Zustand + URL query params so a link reproduces the view).

## 4. Demo storyline (the 12-minute walkthrough)

1. **Overview** - "Good morning OBX. Both lines, one screen." L2 WFE-2M shows Downtime (vacuum loss) since 07:42; one Major deviation open on ISO-C.
2. **Machine Timeline -> WFE-2M** - zoom into last night; show 2-hour paper snapshots vs continuous history (the pre-read's "before/after").
3. **Downtime Logger** - vacuum loss event auto-detected, operator tagged reason "Vacuum pump - oil degraded" from tablet; Pareto grouped by failure mode shows the vacuum family (E101-E105) = #1 equipment loss on L2 this month (~18 % of L2 downtime); ungrouped, top codes are M102 crude-not-available and Q101 awaiting lab - a good talking point that L2 also loses time to material and lab waits.
4. **OEE -> L2 -> WFE-2M** - waterfall shows availability as the main loss; shift B consistently lower -> questions for onsite.
5. **Process Parameters -> WFE-2M** - evaporator temp vs vacuum vs distillate potency; golden operating window; Cpk 0.87 vs Ppk 0.58 on evaporator temp (mean shifts between shifts).
6. **Process Parameters -> ISO-C** - cooling curve outside golden tunnel between 18-22 h; deviation DEV-L2-0142 raised, escalated to L2 supervisor at +15 min.
7. **Logbooks -> FOR-BIP-004 ISO-C** - form with internal temperature milestones auto-filled from controller, visual checks by operator, supervisor review pending.
8. **L1 - Solvent balance** - heptane loss per kg MIT by unit operation (extraction / LLE / SRU / crystallization); answers OBX's own question.
9. **Quality Loss Logger** - freebase drum held for residual heptane, linked COA, disposition "Rework - re-dry".
10. Close on **Batch Genealogy** - one released salt run reconstructed end-to-end in 3 clicks.

## 5. Module -> pre-read priority mapping

| Pre-read priority | Demo module(s) |
|---|---|
| 1 Foundation connectivity + common batch context | Overview, Timeline, Genealogy, source badges |
| 2 Bulk electronic batch records | Logbooks (FOR-BIP-009/010/004/003) |
| 3 Kratom PLC telemetry ingestion | Timeline + Parameters for L1-EXT, L1-LLE |
| 4 Heptane solvent mass balance | Parameters -> Solvent Balance tab, OEE yield panel |
| 5 Kratom crystallization dataset | Parameters golden tunnel for L1-CRY-01/02 |
| 6 WFE continuous operating history | Timeline + SPC for L2-WFE-1M/2M |
| 7 Connected scales + quality linkage | Logbook scale fields, Quality Loss logger COA links |
| 8 Advanced AI | "Bruce AI" teaser card only (ask: "Why was yesterday's 2M potency low?") - clearly labelled future phase |

## 6. Roles (RBAC used by every module)

| Role | Can |
|---|---|
| Operator | View own line; tag downtime reasons; fill logbook entries; raise quality hold |
| Shift Supervisor | All operator actions; review/verify logbook; acknowledge deviations; override reason tags with comment |
| Production Manager | All lines; approve shift summary; close downtime RCA |
| QA / Quality | Approve logbook records (e-sign); disposition quality loss; close deviations; edit limits (versioned) |
| Plant Head | Read all; receives L4 escalations |
| Admin (Faclon/OBX IT) | Reason trees, shifts, users, escalation matrix; cannot edit records |

Every write creates an audit entry: who, when (UTC), what, old value, new value, reason-for-change.

## 7. Success metrics the demo should visibly promise (tie to pre-read)

- Record-review time per bulk batch: paper baseline vs eBPR (show "Review time: 6 min" on an approved FOR-BIP-004)
- Duplicate transcriptions removed: count of auto-populated fields per form
- Heptane loss L/kg MIT, localised to unit operation
- Downtime hours by reason, MTTR per asset
- % batches inside golden tunnel; Ppk trend of critical parameters
- Time to reconstruct a released batch (target < 2 min)
