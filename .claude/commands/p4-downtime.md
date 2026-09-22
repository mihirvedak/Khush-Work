---
description: P4 - Downtime Logger
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

Read 03 (downtime section) and 01 (reason tree codes P/E/R/M/U/Q/H/X, U000).
Build /downtime:
- Charts: Pareto (hours, cumulative % line, toggle by code / by failure-mode family = first 2-3 code chars, toggle hours / count), category donut, shift A vs B stacked bars per day, asset x day heatmap (hours down).
- Metrics tiles: total unplanned h, MTTR, MTBF, stops count, untagged ratio (target < 5 %), RCA-required count.
- Table with columns from 03 (Event ID shown as DT-Ln-nnnnnn, Detected by, Tagged by, Status Open/Tagged/RCA required/Closed, Escalation level). RCA-required rule: duration >= 60 min or same reason 3x in a shift.
- Tagging drawer: quick chips of top-6 recent reasons for that asset, full ReasonPicker, preset actions per reason, optional maintenance WO field, remarks. 48 px targets (tablet).
- Talking point built in: Pareto grouped by family shows E1 vacuum family as #1 equipment loss on L2; ungrouped shows M102 and Q101 - add a small "Insight" callout that states this from computed data (not hard-coded text).
