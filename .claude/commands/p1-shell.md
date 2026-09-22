---
description: P1 - App shell, theme and shared components
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

Read .claude/skills/obx-faclon-ops-demo/references/08-design-theme.md (authoritative for every colour, font, size) and 00-solution-overview.md (IA).

Build:
1. Tailwind config + src/styles/tokens.css exactly per 08 (light + dark, CSS variables). Google Fonts: TASA Orbiter (Bold, titles only) and Inter 400/500/600/700, JetBrains Mono. No hex values inside TSX.
2. ECharts theme 'faclon' from 08 section 5, registered once; a <Chart> wrapper that applies theme, aria, decal, resize observer, loading + empty states, and a "View as table" toggle.
3. AppShell (UI-01): dark left nav with items Overview, Machine Timeline, Downtime Logger, Quality Loss Logger, OEE, Process Parameters, Logbooks, Batch Genealogy, Settings; top bar with "OBX Roxboro" plant switcher, demo clock (ET, live), persistent amber-outline chip "Demo data - synthetic", notification bell (count of open escalations at demoNow), role switcher, theme toggle.
4. GlobalFilterBar (UI-02) bound to the store and URL.
5. Shared components UI-03 .. UI-16 from 08 section 4, each with default/hover/focus/disabled/loading/empty/error states, in src/components/. Build a /_kitchen-sink route rendering every component in every state (this is our visual QA page).
6. Routing with lazy-loaded pages; each page a placeholder using AppShell.

Acceptance: keyboard can reach every nav item and filter; focus ring visible; state chips follow the tinted-chip contrast rule in 08; Lighthouse accessibility >= 95 on kitchen-sink.
