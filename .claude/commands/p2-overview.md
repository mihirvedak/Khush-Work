---
description: P2 - Overview
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

Read 00 (storyline beat 1) and 04. Build the Overview page:
- Critical banner (UI-16) for every ongoing DOWN on a constraint asset: "L2-WFE-2M 2M WFE Distillation - Down 8 h 38 m (ongoing) - E102 Pump oil degraded - tagged J. Alvarez 07:55" with links to Timeline (pre-filtered) and the escalation.
- Two line cards side by side (L1 Kratom/MIT, L2 Bulk Cannabinoids): line OEE (constraint-asset method) with A/P/Q, current shift vs previous shift delta, a mini state strip (last 12 h) per asset, count of assets by state now, open deviations, holds, due/overdue logbooks, untagged stops.
- Row of KPI tiles: Plant OEE, Unplanned downtime h (current shift), Untagged ratio %, Open deviations by severity, Logbook on-time %, Escalation SLA met %.
- "Needs attention" list: merged open items sorted by severity then age, each with owner and one primary action.
All numbers from selectors; clicking any tile drills to the owning module with filters applied.
