---
description: P10 - Demo mode, QA and polish
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

Review the whole app as Technical Lead + UX researcher.
1. Demo mode: a guided script panel (toggle, bottom-right) with the 10 beats from 00; each beat has a "Go" button that sets route, filters and demoNow, plus the one-line talk track. Reset demo button.
2. Verify all acceptance criteria in 02-06; write the failures as a checklist and fix them.
3. Performance: route-level code splitting, memoised selectors, LTTB sampling, no chart with > 5,000 points per series, first paint of Timeline < 1.5 s on a 2020 laptop.
4. Accessibility pass per 08 section 8.
5. Copy pass: real OBX names everywhere (asset ids, form numbers, revisions), units in every header, no lorem ipsum, no "NaT", no generic "Machine 1".
6. Build `npm run build` and a static deploy (Vercel/Netlify). Produce a README with how to run, the demo script, and the list of demo assumptions pending OBX confirmation.
