# 04 - OEE Dashboards (batch-aware)

## Definitions (use exactly)

Time model (per asset, per period):
```
Calendar time
 - No-schedule (NOSCH)                                  -> excluded
 = Planned production time (PPT)
 - Planned stops inside plan (PLAN: changeover, clean, PM, handover)   -> shown as "Planned losses" (not in Availability by default; toggle "Include planned stops in availability" for TEEP-style view)
 = Available time
 - Unplanned downtime (DOWN + IDLE + HOLD + MICRO)
 = Run time
```
Availability A = Run time / Available time
Performance P:
- Continuous (WFE, LLE, SRU): P = actual throughput / (rated rate x run time), capped at 100 % (flag > 100 % as "rated rate needs review")
- Batch (ISO, RXN, CRY, SLT): P = sum(ideal cycle time of completed batches or phase fractions) / run time
- Cyclic (EXT tanks): P = (ideal cycle 8 h x cycles) / run time
Quality Q = first-pass good output / total output (mass-weighted; batches first-pass released)
OEE = A x P x Q
TEEP = OEE x (PPT / Calendar time)
Yield (separate) = actual target-compound mass out / theoretical target-compound mass in

Line OEE = OEE of the constraint asset (L1: CRY-01+02 combined; L2: WFE-2M). Also display "Asset-average OEE" (run-time weighted) as a secondary number with a tooltip explaining the difference. Plant OEE = PPT-weighted average of the two line OEEs.

Incomplete batches at period end: apportion ideal time by completed phases (phase weights from ideal cycle in `01` §3.2), so shift OEE is not distorted by 30 h batches.

## Screens

### 4.1 Plant / Line overview
```
[Filters]                                                           Period: Today | Yesterday | 7d | 30d | Shift A/B

+ Plant OEE 55.8% (A 81.2 | P 78.4 | Q 87.6) vs target 60%    + L1 Kratom/MIT 58.3%     + L2 Bulk 53.1%
  sparkline 30 d                                                 constraint: CRY-01/02       constraint: WFE-2M
                                                                  Yield MIT 68.4%             Yield CBD 71.2%
                                                                  Heptane 8.9 L/kg MIT        kg distillate 412

[Asset grid: tile per asset - live state colour, OEE today, A/P/Q mini bars, current batch, current reason if down]

[Loss waterfall (line): PPT -> Planned losses -> Availability loss -> Performance loss -> Quality loss -> Effective time]
[Shift comparison: A vs B grouped bars of A, P, Q, OEE for last 14 days]    [OEE trend 30 d with target line + annotations for deviations]
```

### 4.2 Asset drill (e.g., L2-WFE-2M)
- Header: state chip, current batch, current phase, OEE today/shift/7d.
- Loss waterfall in hours.
- Top 5 downtime reasons (from Downtime Logger) and top quality losses.
- Rate chart: actual feed kg/h vs rated 4.0 kg/h over time (performance loss is visible as the gap).
- Batch table: batch ID, start, end, ideal cycle, actual cycle, cycle efficiency %, output kg, yield %, first-pass (Y/N), OEE contribution.
- Link: "Open in Timeline" / "Open parameters".

### 4.3 Batch OEE view (ISO / RXN / CRY)
Gantt of phases: ideal duration (ghost bar) vs actual (solid), phase overrun highlighted - this is where batch "performance loss" lives (e.g., ISO-C crash phase 11.2 h vs ideal 7 h because chiller return temp high).

### 4.4 Production count
- Per shift and day: batches completed, kg produced by product (CBD distillate, CBD isolate, D8, MIT freebase, MIT acetate), plan vs actual (demo plan from schedule), variance %.
- Unit toggle: kg / batches.

## Demo numbers (30 days, generator targets)

| Asset | A | P | Q | OEE |
|---|---|---|---|---|
| L2-WFE-1M | 84 % | 86 % | 96 % | 69 % |
| L2-WFE-2M | 72 % | 81 % | 91 % | 53 % |
| L2-ISO-A..E | 78 - 88 % | 70 - 82 % | 90 - 97 % | 52 - 68 % |
| L2-RXN-1 / 3 | 80 % / 74 % | 85 % / 79 % | 94 % / 90 % | 64 % / 53 % |
| L1-EXT-T01..T04 | 76 - 84 % (weather) | 88 - 93 % | 97 % | 65 - 76 % |
| L1-LLE-01 | 79 % | 74 % | 93 % | 54 % |
| L1-CRY-01 / 02 | 81 % / 77 % | 80 % / 76 % | 92 % / 89 % | 60 % / 52 % |
| L1-SLT-01 | 86 % | 83 % | 96 % | 69 % |

Built-in stories: shift B WFE-2M availability 8 pts below A (vacuum pump oil not changed on B checklist); CRY-02 quality lower (pH probe drift, links to E401 events and calibration logbook).

## Acceptance criteria
- A, P, Q, OEE recompute from events - never stored as independent random numbers (A x P x Q must equal OEE to 0.1 %).
- Switching period/shift updates all widgets together.
- Waterfall segments sum to PPT.
- Hover on any OEE shows the formula with the actual hours/kg used.
