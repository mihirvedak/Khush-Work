# 02 - Machine Timeline

## Why it exists
OBX cannot today answer "what was WFE-2M doing at 02:00?" - the paper log has a snapshot every 2 hours. The timeline is the first proof of **continuous, contextualised history** (pre-read priorities 1, 3, 6). It is also the entry point to tag downtime reasons.

## Baseline: the current I/O Sense "Machine Timeline" (Hamilton) - heuristic review

| # | Observation | Heuristic | Fix in OBX build |
|---|---|---|---|
| 1 | Ongoing event shows `NaT` as End Time | Error prevention / system status | `Ongoing` chip + live duration counter |
| 2 | Row 1 Downtime Reason blank while others filled | Consistency | Untagged events show `Untagged - tag now` button; untagged count in header |
| 3 | 84,350 rows, no visible date / asset filter context | Recognition over recall | Filter chips above table mirror global filters; default to current shift |
| 4 | Micro-stops drawn as red ticks under the bar - readable, but 10 s stops on batch gear are noise | Signal vs noise | Micro-stop ticks only for WFE; "Hide < 5 min" toggle |
| 5 | Single lane - no batch / phase context | Match to real world | Add Phase lane + Batch lane under State lane |
| 6 | Colour-only legend | Accessibility | Patterns (hatch for Planned, dots for Idle), state text on hover, legend with counts & minutes |
| 7 | No zoom / brush | Flexibility | ECharts dataZoom slider + mouse-wheel zoom, preset chips (8 h / 12 h shift / 24 h / 7 d) |
| 8 | "Expected quantity 238.00" vs "Production 200" with no unit | Match to real world | Units in header (`kg`, `batches`), variance column with sign |
| 9 | "Downtime Category: Running" for production rows | Consistency | Category blank ("-") for RUN rows |
| 10 | Horizontal scroll hides reason columns | Visibility | Column chooser + pinned Sr No / Start / Status columns |

## Layout

```
[Global filter bar: Line | Asset(s) | Shift | Date range | Batch search]            [Live o]  [Demo data chip]

+-- KPI strip (for selected range) --------------------------------------------------------------+
| Run 18h42m (78%) | Downtime 3h05m (13%) | Planned 1h20m | Idle 0h53m | Stops 7 | MTTR 26m | Untagged 2 |
+------------------------------------------------------------------------------------------------+

+-- Timeline card -------------------------------------------------------------------------------+
|  Zoom: [8h] [Shift] [24h] [7d]   Group: (o) by asset ( ) by line    [Hide micro-stops] [Export] |
|                                                                                                |
|  L2-WFE-2M   State  |======green=====|##red##|==green===|//purple//|====green======|          |
|              Phase  | WARM | PULL | STEADY FEED ..................| CLEAN | WARM |            |
|              Batch  | 2M-260921-02 ........................|       | 2M-260922-01            |
|              Micro  |   '    '  '                                                            |
|  L2-WFE-1M   State  ...                                                                        |
|  Shift band  |---------- A ----------|----------- B -----------|-------- A ----                 |
|  Axis        22 Sep 06:00 ..... 12:00 ..... 18:00 ..... 00:00 ..... 06:00                      |
|  [=========== dataZoom brush ===========]                                                      |
|  Legend: Production 18h42 | Downtime 3h05 | Planned 1h20 | Idle 0h53 | QA Hold 0 | Disconnected 0 |
+------------------------------------------------------------------------------------------------+

+-- Event Details (virtualised table) ------------------------------------ Showing 1-25 of 1,284 -+
| Sr | Start | End | Duration | Shift | Asset | Batch/Lot | Phase | Recipe/Product | Status | Category | Reason | Expected (kg) | Actual (kg) | Var % | Tagged by | Remarks | ... |
+------------------------------------------------------------------------------------------------+
```

- Multi-asset view: one lane group per asset, max 12 groups visible, virtual scroll beyond. "By line" collapses assets into a line-level lane using the constraint asset state + count of assets down.
- Hover tooltip: state, start, end/Ongoing, duration, reason (or "Untagged"), batch, phase, key parameter snapshot at start of event (e.g., `VAC 0.184 mbar`, `EVAP 174.6 degC`), source badge.
- Click a segment: right drawer "Event detail" with reason tagger (if DOWN/IDLE/MICRO), parameter sparklines for +/-30 min, linked deviations, linked logbook entry, audit trail.
- Click a phase: jumps to Process Parameters with the batch + phase pre-selected (golden tunnel view).
- Live mode: auto-refresh every 10 s; the last segment grows; "Ongoing" pulse on the right edge.

## Event model rules

1. Events are contiguous and non-overlapping per asset: `end[i] == start[i+1]`.
2. Minimum segment 10 s (below that merge into previous).
3. RUN segments split at shift boundaries and phase boundaries (so shift OEE is exact); DOWN segments **do not** split at shift boundaries in the table (one event, shows "A->B" shift) but are apportioned to shifts in OEE.
4. MICRO (< 5 min, WFE only) rendered as ticks below the state bar, still a row in the table with Status `Micro-stop`.
5. DISC when edge heartbeat missing > 2 min; on reconnect, buffered data back-fills and the DISC segment is replaced by real states (show "Back-filled from edge buffer" badge) - this demonstrates outdoor-pad edge buffering asked in the pre-read.
6. Expected quantity per RUN event = ideal rate x duration (WFE) or ideal batch fraction (batch assets). Actual = measured kg.

## Table columns (final)

| Column | Notes |
|---|---|
| Sr No. | pinned |
| Event Start / Event End | `YYYY-MM-DD HH:mm:ss` ET; End = `Ongoing` chip |
| Duration | `HH:mm:ss`; > 24 h shows `1d 03:12:44` |
| Shift | A / B / `A->B` |
| Line / Asset | e.g., `L2 / L2-WFE-2M` |
| Batch / Lot | OBX ID, link to genealogy |
| Phase | ISA-88 phase |
| Product | e.g., `CBD Distillate`, `CBD Isolate`, `D8 Crude`, `MIT Freebase`, `MIT Acetate` |
| Rated capacity | e.g., `4.0 kg/h` or `30 h / batch` |
| Machine Status | chip: Production / Downtime / Micro-stop / Planned / Idle / QA Hold / Disconnected |
| Downtime Category | from reason tree (blank for Production) |
| Downtime Reason | `R101 Vacuum loss - process` or `Untagged - tag now` |
| Expected qty / Actual qty / Variance % | units in header |
| Source | `PLC` / `Controller` / `Manual` badges |
| Tagged by / Tagged at | operator + timestamp |
| Remarks | free text, max 500 chars |

Column filters: status (multi), category (multi), reason (search), shift, duration range (e.g., > 30 min), untagged only.

## ECharts implementation notes

- State lane: `custom` series, `renderItem` draws rect per segment (`api.coord([start, laneIndex])`), `clip: true`; ~50k segments OK with `large` off and `progressive: 2000`.
- Micro ticks: separate `custom` series drawing 2 px lines under the lane.
- Phase/batch lanes: `custom` series with text labels, hide label when width < 40 px.
- Shift band: `markArea` on x-axis with alternating tints.
- `dataZoom`: `[{type:'inside'}, {type:'slider', height: 18}]`, `filterMode: 'weakFilter'`.
- x-axis `type: 'time'`, formatter in America/New_York.
- Pattern fills: ECharts `decal` for Planned (diagonal) and Idle (dots) - enable `aria.decal.show`.

## Edge cases

- Asset in DISC across a shift boundary; OEE excludes DISC from planned time only if flagged "data loss", otherwise show "Data gap" warning on OEE.
- Two reasons for one long stop -> "Split event" action in drawer (supervisor only), audit logged.
- Reason re-tag after shift closed -> requires reason-for-change.
- Clock skew from edge -> events stamped by edge time; server receipt time in audit only.
- Batch spans midnight / multiple days (ISO 30 h) -> batch lane label repeats at viewport start.
- Timezone DST change (first Sunday of Nov) -> 25-hour day; axis must not duplicate labels silently.

## Acceptance criteria

- Given WFE-2M in DOWN since 07:42 and untagged, the header shows `Untagged 1`, the segment is red, table End = `Ongoing`, and an operator can tag it in <= 3 clicks.
- Zooming to a 10-minute window renders the micro-stops as distinct ticks with tooltips.
- Selecting shift B recomputes the KPI strip and table to 18:00-06:00 only.
- Clicking an ISO-C `CRASH` phase opens Process Parameters with ISO-C, that batch and phase selected.
- 30 days x 20 assets renders first paint < 1.5 s on a 2020 laptop (virtualise table, pre-aggregate events per zoom level).
