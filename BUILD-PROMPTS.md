# Build Prompts - OBX x Faclon Operations Demo (Claude Code)

Each prompt is also installed as a slash command in `.claude/commands/` - in Claude Code type `/p0-scaffold`, `/p1-shell`, ... instead of pasting.
Run them **in order, one per session** (`/clear` between prompts), review the diff, run `npm run check`, commit, then move on.

**Build order:** P0 -> P1 are the foundation (data layer, store, theme, shared components). P2-P9 are independent screens after that (can run on parallel branches). P10 is the final hardening pass.

| # | Prompt | Attach / read | Est. effort |
|---|---|---|---|
| P0 | Scaffold + data layer | SKILL.md, 07, data/* | S |
| P1 | App shell, theme, shared components | 00, 08 | M |
| P2 | Overview | 00, 04 | S |
| P3 | Machine Timeline | 02, 01 | L |
| P4 | Downtime Logger | 03, 01 | M |
| P5 | Quality Loss (Rejection) Logger | 03, 01 | M |
| P6 | OEE dashboards | 04 | M |
| P7 | Process Parameters / SPC / Golden Tunnel / Deviations / Solvent | 05, 01 | L |
| P8 | Logbooks + Escalation | 06, 01 | L |
| P9 | Batch Genealogy | 00, 07 | S |
| P10 | Demo mode, QA, polish | all | M |

---

## P0 - Scaffold and data layer

```
You are building a client demo for Faclon Labs (I/O Sense) for Open Book Extracts (OBX), Roxboro NC.
Read .claude/skills/obx-faclon-ops-demo/SKILL.md first and obey its hard rules. Then read references/07-data-model-dummy-data.md and skim references/09-form-schema.md.

Task: scaffold the app and data layer only - no screens yet. Plan first, show me the plan, then implement.

Stack (fixed): Vite + React 18 + TypeScript strict, Tailwind, echarts + echarts-for-react, @tanstack/react-table v8 + @tanstack/react-virtual, zustand, date-fns + date-fns-tz, react-router v6, lucide-react, vitest + @testing-library/react. No other UI or chart libraries.

1. Scaffold in the repo root (package.json, vite, tsconfig strict, tailwind, eslint). Scripts: dev, build, test, typecheck (tsc --noEmit), check (typecheck + test).
2. Copy seed-data/types.ts, generator.ts, forms.ts, index.ts to src/data/ UNCHANGED. The app imports only from src/data/index.ts and calls buildDataset() (never buildDemoDataset directly - index.ts adds the schema-conformant logbook entries).
3. src/store/demo.ts (zustand):
   - dataset: buildDataset() once (lazy, memoised).
   - demoNow: number, starts at dataset.meta.to, advanced by a ticker (x1 real time; x10 / x60 accelerated modes for the logbook demo).
   - overlay: Record<entityId, Partial<entity>> for operator actions (tag reason, fill form field, sign, acknowledge, disposition). Selectors merge dataset + overlay; never mutate dataset.
   - filters: { line, area, assetIds, shift, from, to, product } synced two-way with URL search params.
   - role: 'Operator' | 'Shift Supervisor' | 'Production Manager' | 'QA' | 'Plant Head' | 'Admin' (demo role switcher) and currentUser (from PEOPLE).
   - resetDemo(): clears overlay, resets demoNow.
4. src/lib/time.ts: fmtET(ms, pattern), shift band helpers (A 06:00-18:00, B 18:00-06:00 ET), window presets (Current shift, Last 24 h, Today, Yesterday, 7 d, 30 d) from demoNow in America/New_York, stepSec chooser (<=24h 60s, <=7d 300s, else 900s).
5. src/lib/selectors.ts: typed memoised selectors - eventsInWindow, batchesInWindow, oeeFor(assetIds, window, shift?), paretoFor(line, window, groupByFamily), openItems(now), entriesFor({formNo?, assetId?, line?, shift?, day?, batchId?}), formRecord(formNo, batchId) (groups entries of one batch into a single record ordered by section/row).
6. Unit tests (vitest): A*P*Q equals oee within 0.001; events per asset contiguous and non-overlapping; exactly one ongoing DOWN on L2-WFE-2M with reasonCode E102; shiftOf(06:00 ET)='A', shiftOf(17:59:59 ET)='A', shiftOf(18:00 ET)='B'; EVERY logbookEntries[].fields[].key exists in FORMS for that formNo and section; FORMS has 14 forms and FOR-BIP-004 has a CRASH section repeating 1..4.

Deliver: `npm run dev` shows a placeholder page printing dataset counts (events, batches, entries per form); `npm run check` green.
```

## P1 - App shell, theme and shared components

```
Read .claude/skills/obx-faclon-ops-demo/references/08-design-theme.md (authoritative for every colour, font, size) and 00-solution-overview.md (IA).

Build:
1. Tailwind config + src/styles/tokens.css exactly per 08 (light + dark, CSS variables). Google Fonts: TASA Orbiter (Bold, titles only) and Inter 400/500/600/700, JetBrains Mono. No hex values inside TSX.
2. ECharts theme 'faclon' from 08 section 5, registered once; a <Chart> wrapper that applies theme, aria, decal, resize observer, loading + empty states, and a "View as table" toggle.
3. AppShell (UI-01): dark left nav with items Overview, Machine Timeline, Downtime Logger, Quality Loss Logger, OEE, Process Parameters, Logbooks, Batch Genealogy, Settings; top bar with "OBX Roxboro" plant switcher, demo clock (ET, live), persistent amber-outline chip "Demo data - synthetic", notification bell (count of open escalations at demoNow), role switcher, theme toggle.
4. GlobalFilterBar (UI-02) bound to the store and URL.
5. Shared components UI-03 .. UI-16 from 08 section 4, each with default/hover/focus/disabled/loading/empty/error states, in src/components/. Build a /_kitchen-sink route rendering every component in every state (this is our visual QA page).
6. Routing with lazy-loaded pages; each page a placeholder using AppShell.

Acceptance: keyboard can reach every nav item and filter; focus ring visible; state chips follow the tinted-chip contrast rule in 08; Lighthouse accessibility >= 95 on kitchen-sink.
```

## P2 - Overview

```
Read 00 (storyline beat 1) and 04. Build the Overview page:
- Critical banner (UI-16) for every ongoing DOWN on a constraint asset: "L2-WFE-2M 2M WFE Distillation - Down 8 h 38 m (ongoing) - E102 Pump oil degraded - tagged J. Alvarez 07:55" with links to Timeline (pre-filtered) and the escalation.
- Two line cards side by side (L1 Kratom/MIT, L2 Bulk Cannabinoids): line OEE (constraint-asset method) with A/P/Q, current shift vs previous shift delta, a mini state strip (last 12 h) per asset, count of assets by state now, open deviations, holds, due/overdue logbooks, untagged stops.
- Row of KPI tiles: Plant OEE, Unplanned downtime h (current shift), Untagged ratio %, Open deviations by severity, Logbook on-time %, Escalation SLA met %.
- "Needs attention" list: merged open items sorted by severity then age, each with owner and one primary action.
All numbers from selectors; clicking any tile drills to the owning module with filters applied.
```

## P3 - Machine Timeline

```
Read .claude/skills/obx-faclon-ops-demo/references/02-machine-timeline.md fully (heuristic fixes to the Hamilton screen, layout, event rules, columns, ECharts notes, edge cases, acceptance criteria) and 01 for asset names/states.

Build /timeline:
- Header: asset selector (single or multi, grouped by line/stage, constraint assets starred), window presets, KPI strip (Run %, Unplanned down h, Micro-stops count, Longest stop, Untagged count with "Tag now" button).
- Lanes per asset (UI-06): State lane, Phase lane (ISA-88 phases), Batch lane (OBX batch ids). ECharts custom series with renderItem rectangles, decals per state, shift bands via markArea, dataZoom slider + inside zoom, presets 1 h / 8 h / 24 h / 7 d, progressive 2000. Micro-stop noise toggle (merge MICRO < 60 s into RUN visually, still counted).
- Ongoing event renders to demoNow with a pulsing right edge; table shows chip "Ongoing" - never NaT.
- DISC events with backfilled=true: hatched grey + badge "Back-filled from edge buffer (24 min)".
- Event Details table (UI-07) with the column set in 02 (Sr No, Event ID, Start, End, Duration hh:mm:ss, Shift, Batch, Phase, Product, State chip, Category, Reason, Detected by, Expected qty (kg), Actual qty (kg), Tagged by, Remarks). RUN rows show '-' for category/reason. Virtualised; brushing the chart filters the table; clicking a row highlights the bar and opens the EntityDrawer with a "Tag reason" action (ReasonPicker) for DOWN/MICRO/IDLE/HOLD.
- Tagging writes to overlay; untagged count updates live.
Acceptance criteria: those in 02 section "Acceptance", incl. first paint < 1.5 s for 30 d x all assets, DST day handling, split-at-shift-boundary display.
```

## P4 - Downtime Logger

```
Read 03 (downtime section) and 01 (reason tree codes P/E/R/M/U/Q/H/X, U000).
Build /downtime:
- Charts: Pareto (hours, cumulative % line, toggle by code / by failure-mode family = first 2-3 code chars, toggle hours / count), category donut, shift A vs B stacked bars per day, asset x day heatmap (hours down).
- Metrics tiles: total unplanned h, MTTR, MTBF, stops count, untagged ratio (target < 5 %), RCA-required count.
- Table with columns from 03 (Event ID shown as DT-Ln-nnnnnn, Detected by, Tagged by, Status Open/Tagged/RCA required/Closed, Escalation level). RCA-required rule: duration >= 60 min or same reason 3x in a shift.
- Tagging drawer: quick chips of top-6 recent reasons for that asset, full ReasonPicker, preset actions per reason, optional maintenance WO field, remarks. 48 px targets (tablet).
- Talking point built in: Pareto grouped by family shows E1 vacuum family as #1 equipment loss on L2; ungrouped shows M102 and Q101 - add a small "Insight" callout that states this from computed data (not hard-coded text).
```

## P5 - Quality Loss & Disposition Logger (the client's "rejection logger")

```
Read 03 (quality-loss section: why "rejection" becomes Quality Loss & Disposition for batch chemistry, record fields, dispositions Hold/Rework/Downgrade/Scrap, QA-only disposition, dual sign for scrap, rework reactor-hours KPI) and 01 (QL1-01..14, QL2-01..15).
Build /quality-loss:
- Shift cards (A / B) for the selected day: kg lost by disposition, count, top reason, handover note field (supervisor), open holds.
- Charts: kg lost by reason (Pareto), by disposition over time, by asset; recovered vs lost kg.
- Table with QL record fields; Evidence column links COA/HPLC (mock PDF drawer).
- Actions by role: Operator can raise; QA only can disposition; Scrap requires second signature (SignatureDialog x2). Disposition updates the batch firstPass and the OEE Quality for that asset immediately (show that live).
- Clear microcopy: "Yield is reported next to OEE, not inside it."
```

## P6 - OEE dashboards

```
Read 04 fully (time model, A/P/Q per asset kind, line OEE = constraint asset, TEEP, incomplete-batch apportionment, screens 4.1-4.4, stories, acceptance).
Build /oee with tabs:
4.1 Plant & line: OEE, A, P, Q, TEEP tiles per line; trend by day with target line; OEE waterfall (Calendar -> Not scheduled -> Planned -> Unplanned -> Speed loss -> Quality loss -> Good time) as a stacked horizontal bar; asset league table with sparkline; shift A vs B comparison.
4.2 Asset drill: same waterfall for one asset, loss Pareto, OEE by batch (batch assets) or by hour (continuous).
4.3 Batch phase Gantt: for batch assets, each batch as a row of phases, ideal duration ghost vs actual, overrun highlighted, click -> batch genealogy.
4.4 Production count: kg in / kg out / good kg by day and shift, yield % shown beside (never multiplied into OEE).
Info icons show the exact formula. Acceptance: A x P x Q equals displayed OEE within 0.1 %; shift B WFE-2M availability gap and CRY-02 quality gap visible without configuration.
```

## P7 - Process Parameters, SPC, Golden Tunnel, Deviation Log, Solvent Balance

```
Read 05 fully and 01 parameter tables (units, sources, data states, demo limits).
Build /process with tabs:
1. Live: per asset parameter tiles (valueAt at demoNow) with SourceBadge, limit status, sparkline; WFE-2M dual-axis evaporator temp + vacuum with labelled units.
2. Trends: multi-tag chart, limit hierarchy lines (Spec red dashed / Control blue dotted / Golden band) per 08, state lane underneath synced zoom, annotations for deviations.
3. SPC: X-bar/R (n=5 subgroups, STEADY FEED only) for continuous tags; I-MR for batch endpoints (batch.metrics). Nelson rules 1, 2, 3, 5 flagged with rule numbers. CapabilityPanel (UI-14) with Cp/Cpk/Pp/Ppk, "Indicative" when n < 30, no compute when n < 10, formulas on hover. Compute live via capability(); never hard-code the values in 05.
4. Golden Tunnel: goldenTunnel('L2-ISO','T_INT') band vs % phase, overlay live ISO-C batch leaving the tunnel, contributing batch list with yield/purity; WFE golden operating window scatter (evap temp vs vacuum, coloured by distillate yield) with hull.
5. Deviation Log: table + DeviationCard drawer, workflow Open -> Acknowledged -> Under investigation -> Action taken -> Closed, severity rules, links to downtime event and CAPA.
6. Solvent Balance (L1): heptane Sankey (make-up -> LLE -> SRU -> FIL -> losses) with the 38/27/21/14 split, loss per kg finished MIT KPI, reconciliation table.
Every limit marked demoLimit shows the DEMO tag and tooltip "Demo limit - pending OBX Quality (SOP-BIP-004 / SOP-BIP-006 scope unresolved)".
```

## P8 - Logbooks and Escalation

```
Read .claude/skills/obx-faclon-ops-demo/references/06-logbooks-escalation.md (principles, screens, escalation matrix, acceptance) and references/09-form-schema.md (EVERY form, section and field). src/data/forms.ts (FORMS) is the source of truth - the UI must be schema-driven.

Build /logbooks:
1. FormRenderer (schema-driven, one component for all 14 forms): renders FormDef.sections in order; repeating sections (2-hour CHECK rows, CRASH 1..4, WASH 1..3, OIL additions) as a row table on desktop and stacked cards on tablet; sections with appliesTo only for matching assets; fields with appliesTo filtered by asset.
   Field widgets by type: number (unit suffix, decimals), datetime (ET), select/multiselect, boolean, attest (checkbox + "I confirm" + initials), esign (SignatureDialog: user + PIN + meaning), scan (text + scan icon), photo (mock upload), passfail (segmented Pass/Fail), link (deviation picker), longtext, id (read-only chip).
   Capture behaviour: live/milestone/calc/genealogy/scale/lims/erp/system fields are read-only, show SourceBadge + timestamp + info tooltip with `rule`; manual fields editable only by editableBy roles (default Operator). Live fields auto-fill from valueAt(assetId, tag, now) when a NEW entry is started.
   Limits: show target/min/max inline; limitRef shown as "Limit: SOP-BIP-003"; no limitRef => DEMO tag + tooltip "Demo limit - pending OBX Quality". limitRows respected (wash pH only on wash 3). Out-of-limit value turns the field red with icon + text and BLOCKS submit until comment + deviation link (creates a deviation in overlay).
   Corrections: strike-through old value, reason-for-change required, shown inline with who/when. Approved records read-only with lock icon.
2. Logbook home with views: My tasks (by role: due/overdue/returned for Operator, to-review for Supervisor, to-approve for QA), Shift grid (forms x 2-hour slots for the selected shift; cell = status chip with text), Day view, Batch view (formRecord groups every entry of a batch into one record: e.g. FOR-BIP-010 header + all 2-hour rows + oil + close + distillate), Machine view, Line view, Form library (form no, title, revision, effective date, OBX vs demo badge, field count, open the blank form).
3. Review flow: Submitted -> Reviewed (Shift Supervisor) -> Approved (QA) -> Locked, per FormDef.signoff (some forms stop at Review/Verify). Exceptions-only review list (entries with outOfLimit, corrections or late entry). Audit trail tab.
4. Auto-milestones visible live: FOR-BIP-004 REACHED_M18 fills when T_INT <= -18 for 5 consecutive min (ISO-C live batch is still empty - show "Waiting: -19.1 degC trend, est. 42 min"); FOR-BIP-003 recipe calc from input mass and % time in 85-95 degC band.
5. /escalations: matrix view (triggers x L1-L4 with SLA, from 06), live list, SLA widget (ack time p50/p90, % met by level and shift). The missed LOG-EQ-DAILY vacuum-pump-oil checks on WFE-2M shift B must be visible and link to the WFE-2M E102 downtime; LOG-CAL L1-CRY-02.PH as-found FAIL links to CRY-02 final-pH deviations.
Accelerated clock (x60) lets a 2-hour FOR-BIP-010 check come due during the live demo.
Tests: FormRenderer renders every FORMS entry without throwing; submit blocked when an out-of-limit field has no comment; a repeat section renders the right number of rows for a sample record.
```

## P9 - Batch Genealogy (demo finale)

```
Read 00 (storyline final beat) and 07 ID formats.
Build /genealogy: search any batch id; tree/graph of parents and children (L1: KX -> LLE -> SRU/MCB -> MFD -> MAS -> MSD; L2: 1M -> 2M -> ISO/D8 -> BUF -> VO); selecting a node shows its phases Gantt, key parameter curves (getSeries over the batch window), events, quality losses, deviations, logbook entries with signatures, and COA link. "Export batch record (PDF)" button produces a printable page. Goal: any released batch reconstructed in 3 clicks.
```

## P10 - Demo mode, QA and polish

```
Review the whole app as Technical Lead + UX researcher.
1. Demo mode: a guided script panel (toggle, bottom-right) with the 10 beats from 00; each beat has a "Go" button that sets route, filters and demoNow, plus the one-line talk track. Reset demo button.
2. Verify all acceptance criteria in 02-06; write the failures as a checklist and fix them.
3. Performance: route-level code splitting, memoised selectors, LTTB sampling, no chart with > 5,000 points per series, first paint of Timeline < 1.5 s on a 2020 laptop.
4. Accessibility pass per 08 section 8.
5. Copy pass: real OBX names everywhere (asset ids, form numbers, revisions), units in every header, no lorem ipsum, no "NaT", no generic "Machine 1".
6. Build `npm run build` and a static deploy (Vercel/Netlify). Produce a README with how to run, the demo script, and the list of demo assumptions pending OBX confirmation.
```
