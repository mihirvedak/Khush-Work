# 03 - Downtime Logger & Quality Loss (Rejection) Logger

## A. Downtime Logger

### Purpose
Turn auto-detected stops into attributed, actionable losses. Faclon pattern: detection is automatic (from state), attribution is human (operator tags), analysis is automatic (Pareto, MTTR/MTBF, shift compare).

### Screen layout

```
[Filters: Line | Asset | Shift | Date | Category | Tagged/Untagged]

KPI strip:  Downtime 41h12m | Events 63 | MTTR 39m | MTBF 11.4h | Untagged 3 (1h07m) | Top reason: R101 Vacuum loss (9h40m)

Row 1:  [Pareto by reason (bar + cumulative line, top 10, click to filter)]   [Downtime by category donut]
Row 2:  [Shift-wise stacked bar: A vs B per day, stacked by category]         [Asset x Day heatmap (minutes down)]
Row 3:  Downtime event table (tagging inline)
```

### Event table
Columns: Event ID (`DT-L2-000431`) | Asset | Start | End / Ongoing | Duration | Shift | Batch | Phase at stop | Category | Reason | Detected by (`Auto: vacuum > USL` / `Auto: feed = 0` / `Manual`) | Tagged by | Action taken | Maintenance WO (optional link) | Status (`Open`, `Tagged`, `RCA required`, `Closed`) | Escalation level.

Rules:
- Stops >= 60 min or repeating >= 3 times per shift with the same reason set Status `RCA required` (Production Manager closes with root cause + countermeasure).
- Operator can tag own shift; supervisor can re-tag up to 24 h after shift end; later edits need Production Manager + reason-for-change.
- "Quick tag" chips show the top 6 reasons for this asset in the last 30 days (reduces cognitive load on tablets).

### Tagging drawer (tablet-first, 48 px targets)
1. Category chips (P, E, R, M, U, Q, H, X) with icons
2. Reason list filtered by category + asset applicability (from `01` §6)
3. Optional: "What did you do?" (Action taken) - preset actions per reason (e.g., E102 -> "Changed pump oil", "Flushed pump", "Called maintenance")
4. Remarks
5. Save -> audit entry; toast "Tagged R101 - 1h42m".

### Metrics (definitions)
- MTTR = total unplanned downtime / count of unplanned stops (exclude micro-stops)
- MTBF = total run time / count of unplanned stops
- Downtime % = unplanned downtime / planned production time
- Untagged ratio = untagged minutes / total downtime minutes (target < 5 % at shift close)

## B. Quality Loss Logger ("Rejection Logger")

### Why reframed
In OBX's processes material is rarely thrown away; it is held, reworked or downgraded. Logging only "rejects" would hide the biggest cost: **rework cycles consume reactor time** (availability) and **solvent** (L1 KPI). The logger captures both the mass and the disposition.

### Screen layout

```
[Filters: Line | Stage | Asset | Shift | Date | Disposition]

KPI strip: Quality loss 212.4 kg | Rework 168.0 kg (79%) | Scrap 11.6 kg | On hold 32.8 kg (4 lots) | First-pass yield 91.2% | Rework reactor-hours 46h

Row 1: [Loss by reason Pareto (kg)]                  [Disposition split stacked bar by line]
Row 2: [Shift-wise quality loss (A vs B) by day]     [First-pass yield trend by asset]
Row 3: Quality loss event table
```

### Record fields
| Field | Example | Source |
|---|---|---|
| QL ID | `QL-L2-00087` | auto |
| Date/time, Shift | 2026-09-21 03:18, B | auto |
| Line / Stage / Asset | L2 / ISO / L2-ISO-C | select |
| Batch / Lot / Drum | ISO-C-260920-01-C1 | scan / select |
| Reason | QL2-06 Isolate purity < 99.0 % | select (tree in `01` §7) |
| Evidence | HPLC result 98.62 % (link COA / LIMS) | LIMS/COA badge |
| Quantity affected | 21.4 kg | Scale |
| Disposition | Rework (re-crystallize) | QA only |
| Rework route | -> L2-ISO-D next available | select |
| Recovered qty (after rework) | 19.8 kg | Scale (closes the record) |
| Raised by / Dispositioned by (e-sign) | T. Nguyen / Dr. P. Shah | user |
| Status | Open -> On Hold -> Dispositioned -> Closed | workflow |
| Linked deviation | DEV-L2-0142 | link |

Rules:
- Only QA can set disposition; operator can only raise HOLD.
- Scrap requires QA + Production Manager dual sign.
- A record cannot close until recovered quantity (rework) or disposal record (scrap) is entered.
- OEE Quality uses: first-pass released mass; rework mass counts as quality loss for the asset where the defect originated, and rework processing time counts as run time with product "REWORK" (visible in OEE drill).

### Shift-wise view
A card per shift with: events, kg lost, top reason, and "handover note" pulled from the shift logbook - so supervisors see quality and downtime together at handover.

## Escalations (both loggers) - see `06` for full matrix
- Unplanned downtime on a constraint asset (WFE-2M, CRY-0x) > 30 min -> L2 Supervisor; > 2 h -> Production Manager; > 8 h -> Plant Head.
- Any SCRAP or any HOLD for Delta-9 THC / 7-OH -> QA immediately + Plant Head.

## Acceptance criteria
- Tagging a reason updates the Pareto without a page reload.
- Changing Shift filter to B recomputes MTTR, Pareto and the heatmap.
- A HOLD raised on drum FBD-26-0231 appears in Genealogy with a hold badge on its downstream salt run.
