---
description: P3 - Machine Timeline
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

Read .claude/skills/obx-faclon-ops-demo/references/02-machine-timeline.md fully (heuristic fixes to the Hamilton screen, layout, event rules, columns, ECharts notes, edge cases, acceptance criteria) and 01 for asset names/states.

Build /timeline:
- Header: asset selector (single or multi, grouped by line/stage, constraint assets starred), window presets, KPI strip (Run %, Unplanned down h, Micro-stops count, Longest stop, Untagged count with "Tag now" button).
- Lanes per asset (UI-06): State lane, Phase lane (ISA-88 phases), Batch lane (OBX batch ids). ECharts custom series with renderItem rectangles, decals per state, shift bands via markArea, dataZoom slider + inside zoom, presets 1 h / 8 h / 24 h / 7 d, progressive 2000. Micro-stop noise toggle (merge MICRO < 60 s into RUN visually, still counted).
- Ongoing event renders to demoNow with a pulsing right edge; table shows chip "Ongoing" - never NaT.
- DISC events with backfilled=true: hatched grey + badge "Back-filled from edge buffer (24 min)".
- Event Details table (UI-07) with the column set in 02 (Sr No, Event ID, Start, End, Duration hh:mm:ss, Shift, Batch, Phase, Product, State chip, Category, Reason, Detected by, Expected qty (kg), Actual qty (kg), Tagged by, Remarks). RUN rows show '-' for category/reason. Virtualised; brushing the chart filters the table; clicking a row highlights the bar and opens the EntityDrawer with a "Tag reason" action (ReasonPicker) for DOWN/MICRO/IDLE/HOLD.
- Tagging writes to overlay; untagged count updates live.
Acceptance criteria: those in 02 section "Acceptance", incl. first paint < 1.5 s for 30 d x all assets, DST day handling, split-at-shift-boundary display.
