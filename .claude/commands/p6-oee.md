---
description: P6 - OEE dashboards
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

Read 04 fully (time model, A/P/Q per asset kind, line OEE = constraint asset, TEEP, incomplete-batch apportionment, screens 4.1-4.4, stories, acceptance).
Build /oee with tabs:
4.1 Plant & line: OEE, A, P, Q, TEEP tiles per line; trend by day with target line; OEE waterfall (Calendar -> Not scheduled -> Planned -> Unplanned -> Speed loss -> Quality loss -> Good time) as a stacked horizontal bar; asset league table with sparkline; shift A vs B comparison.
4.2 Asset drill: same waterfall for one asset, loss Pareto, OEE by batch (batch assets) or by hour (continuous).
4.3 Batch phase Gantt: for batch assets, each batch as a row of phases, ideal duration ghost vs actual, overrun highlighted, click -> batch genealogy.
4.4 Production count: kg in / kg out / good kg by day and shift, yield % shown beside (never multiplied into OEE).
Info icons show the exact formula. Acceptance: A x P x Q equals displayed OEE within 0.1 %; shift B WFE-2M availability gap and CRY-02 quality gap visible without configuration.
