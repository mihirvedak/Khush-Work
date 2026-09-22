# 05 - Process Parameters, SPC, Cp/Cpk, Golden Tunnel, Deviation Log

## Purpose
Answer OBX's two business questions with evidence:
- L2: "Which WFE operating conditions are associated with yield or quality variation?"
- L1: "Which pH, temperature, dosing and hold profiles are associated with the best crystallization outcomes?" + heptane balance.

## Tabs
1. **Live** - parameter tiles for the selected asset (value, unit, SP vs PV, status vs limits, source badge, "Today: DS3 -> Connected").
2. **Trends** - multi-parameter overlay (up to 6, shared time axis, independent y-axes), spec limits as dashed lines, control limits as dotted, events (downtime, phase changes) as vertical markers.
3. **SPC** - control charts + capability.
4. **Golden Tunnel** - batch profile vs golden envelope (batch assets) / golden operating window (WFE).
5. **Deviation Log** - all excursions with workflow.
6. **Solvent Balance (L1 only)** - heptane in/out/loss by unit operation, L/kg MIT.

## Limit hierarchy (show all three, never confuse them)
| Limit | Owner | Meaning | Visual |
|---|---|---|---|
| Spec limits LSL/USL | OBX Quality (SOP) | Product/process requirement; breach = deviation | red dashed |
| Control limits LCL/UCL | Calculated (mean +/- 3 sigma of in-control baseline) | Process voice; breach = special cause | blue dotted |
| Golden tunnel | Calculated from best batches | Target operating envelope; exit = early warning | green shaded band |
Each limit has version, effective date, approved by. Demo limits show "Demo limit - pending OBX Quality".

## SPC charts
- Continuous signals (WFE evap temp, vacuum, feed rate; SRU reboiler; EXT temp): **X-bar / R** with rational subgroups n = 5 consecutive 1-min averages every 15 min during STEADY FEED phase only (exclude warm-up/shutdown - otherwise sigma is meaningless).
- Per-batch endpoints (ISO crash endpoint temp, RXN exotherm peak, CRY final pH, hold time, yield %): **I-MR** chart, one point per batch/crash.
- Attribute (untagged stops per shift, rework count): p-chart optional.

Rules (Western Electric / Nelson subset, each toggleable, shown as coloured point markers with rule number):
1. 1 point beyond 3 sigma
2. 9 consecutive points on one side of centre line
3. 6 consecutive points increasing or decreasing (trend - key for probe drift, e.g., CRY-02 pH)
5. 2 of 3 consecutive points beyond 2 sigma (same side)

## Capability (Cp, Cpk, Pp, Ppk)

> Values in the story table below are what the seeded generator (seed 2609) actually produces - see `seed-data/sample/capability_snapshot.json`. Do not hard-code them in UI; compute live from `capability()`.

```
sigma_within  = R-bar / d2   (X-bar/R, d2 = 2.326 for n=5)  or  MR-bar / 1.128 (I-MR)
sigma_overall = sample standard deviation of all individual values
Cp  = (USL - LSL) / (6 * sigma_within)
Cpk = min(USL - mean, mean - LSL) / (3 * sigma_within)
Pp  = (USL - LSL) / (6 * sigma_overall)
Ppk = min(USL - mean, mean - LSL) / (3 * sigma_overall)
One-sided spec (e.g., vacuum USL only, crash endpoint USL -18): Cp/Pp = N/A, Cpk = (USL - mean) / (3 sigma) or (mean - LSL) / (3 sigma)
```
Display rules:
- Default for batch endpoints: **Ppk** (one value per batch); for continuous: Cpk + Ppk side by side.
- n < 30 values or < 20 subgroups -> grey "Indicative (n=18)" badge; n < 10 -> do not compute.
- Colour: >= 1.33 green, 1.00 - 1.33 amber, < 1.00 red.
- Show histogram with fitted normal curve, LSL/USL, mean, +/-3 sigma; normality check (Anderson-Darling p shown; if p < 0.05 show "Non-normal - interpret with care").
- 95 % confidence interval for Cpk (Bissell approximation) shown in tooltip.

Demo capability values (generator targets):
| Parameter | Index | Value | Story |
|---|---|---|---|
| WFE-2M evaporator temp (170-180) | Cpk / Ppk | 0.87 / 0.58 | Drift upward on shift B (SP changes); big Cpk-Ppk gap = between-shift shift in mean |
| WFE-2M vacuum (USL 0.050 mbar), STEADY FEED only | Cpk | 4.8 | Talking point: vacuum is *capable while running*; the loss shows up as Availability (vacuum family = #1 L2 downtime mode), not capability. Show both side by side. |
| WFE-2M feed rate (3.0-4.0) | Cpk / Ppk | 2.0 / 1.15 | |
| WFE-1M evaporator temp (145-155) | Cpk | 3.4 | Stable reference |
| ISO crash endpoint (USL -18), n=76 | Cpk / Ppk | 0.76 / 0.63 | ISO-C outliers; live slow crash on ISO-C |
| RXN cook temp (85-95) | Ppk | 1.41 | |
| RXN pre-acid temp (50-55), n=91 | Cpk / Ppk | 0.55 / 0.49 | Acid added early on RXN-3 (mean 52.0 sits low in band) |
| CRY final pH (9.3-9.9), n=60 | Cpk / Ppk | 0.79 / 0.71 | CRY-02 alone: 0.49 / 0.52 (n=29, indicative badge) - probe drift, Rule 3 trend |
| EXT liquor pH (3.0-4.0) | Cpk | ~1.3 | |

## Golden tunnel

### Batch assets (ISO, RXN, CRY, SLT)
1. Candidate batches: last 90 days, completed, first-pass released.
2. Rank by composite score = 0.6 x yield percentile + 0.4 x purity percentile; golden set = top 25 % (min 8 batches; else "Insufficient history" state).
3. Align on **phase-relative time**: each phase normalised to 0-1 (or aligned on key event: acid-in for RXN, start of CRASH for ISO), then resampled to 200 points per phase.
4. Tunnel = median +/- 2 sigma (or P5-P95) of the golden set per point.
5. Live batch overlaid; points outside tunnel for > N consecutive samples (default 10 min) -> "Tunnel exit" deviation (Minor unless also outside spec).
6. Chart: x = phase-aligned time with phase labels, y = parameter; green band, median line, current batch line (blue), previous 3 batches (grey, optional).
Variables: ISO -> T_INT, T_JKT, cooling rate. RXN -> T_INT (1 s) with exotherm zoom inset, HEATER_SP. CRY -> pH, T_INT, dose rate (3 stacked panels, shared x).

### WFE (continuous) - golden operating window
- Scatter matrix: EVAP_PV vs VAC_PV coloured by distillate potency (per 2 h window), golden region = convex hull / P10-P90 box of windows from the best 25 % campaigns (by potency x yield).
- "Current operating point" marker; distance-to-window gauge.
- Parallel-coordinates chart (feed rate, feed temp, evap, condenser, vacuum, wiper -> potency, yield) - this is the visual answer to OBX's L2 question.

## Deviation log

Fields: DEV ID (`DEV-L2-0142`) | Detected at | Ended at / Ongoing | Duration | Line | Asset | Batch | Phase | Parameter | Limit type (Spec / Control rule # / Golden tunnel) | Limit | Worst value | Area outside (value x min) | Severity | Status | Assigned to | Escalation level | Root cause | Action / CAPA ID | Linked downtime | Linked quality loss | Comments.

Severity rules (demo):
- **Critical**: spec breach on a Quality-critical parameter (ISO crash endpoint, RXN cook band, residual solvent, D9 THC, 7-OH) or any breach > 30 min.
- **Major**: spec breach < 30 min on other parameters; golden tunnel exit > 30 min on constraint asset.
- **Minor**: control-rule violation or tunnel exit < 30 min.

Workflow: Open -> Acknowledged (operator/supervisor, required within SLA) -> Under investigation -> Action taken -> Closed (QA for Critical/Major; Supervisor for Minor). Reopen allowed with reason.

## Solvent Balance tab (L1)
- Sankey: Fresh heptane (ERP receipts) + Recovered (SRU) -> LLE / CRY washes -> Recovered / Losses (LLE, SRU, FIL, Unaccounted).
- KPI: L heptane lost per kg MIT (lot, 7 d, 30 d) vs target; loss by unit operation bar; tank reconciliation table (opening + in - out - closing = unaccounted).
- Badge for proposed meters (LLE.ORG_FLOW, SRU.REC_TOTAL) "Proposed instrumentation (DS4)".

## Acceptance criteria
- Cp/Cpk recalculate when date range, asset or shift changes; formula visible on hover.
- SPC excludes non-steady phases automatically; a toggle shows them greyed.
- Golden tunnel shows "Insufficient history" with < 8 qualifying batches.
- Clicking a deviation opens the trend zoomed to +/- 30 min with the excursion shaded.
