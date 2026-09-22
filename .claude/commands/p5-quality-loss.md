---
description: P5 - Quality Loss & Disposition Logger (the client's "rejection logger")
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

Read 03 (quality-loss section: why "rejection" becomes Quality Loss & Disposition for batch chemistry, record fields, dispositions Hold/Rework/Downgrade/Scrap, QA-only disposition, dual sign for scrap, rework reactor-hours KPI) and 01 (QL1-01..14, QL2-01..15).
Build /quality-loss:
- Shift cards (A / B) for the selected day: kg lost by disposition, count, top reason, handover note field (supervisor), open holds.
- Charts: kg lost by reason (Pareto), by disposition over time, by asset; recovered vs lost kg.
- Table with QL record fields; Evidence column links COA/HPLC (mock PDF drawer).
- Actions by role: Operator can raise; QA only can disposition; Scrap requires second signature (SignatureDialog x2). Disposition updates the batch firstPass and the OEE Quality for that asset immediately (show that live).
- Clear microcopy: "Yield is reported next to OEE, not inside it."
