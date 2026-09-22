---
description: P0 - Scaffold and data layer
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

You are building a client demo for Faclon Labs (I/O Sense) for Open Book Extracts (OBX), Roxboro NC.
Read .claude/skills/obx-faclon-ops-demo/SKILL.md first and obey its hard rules. Then read references/07-data-model-dummy-data.md and skim references/09-form-schema.md.

Task: scaffold the app and data layer only - no screens yet. Plan first, show me the plan, then implement.

Stack (fixed): Vite + React 18 + TypeScript strict, Tailwind, echarts + echarts-for-react, @tanstack/react-table v8 + @tanstack/react-virtual, zustand, date-fns + date-fns-tz, react-router v6, lucide-react, vitest + @testing-library/react. No other UI or chart libraries.

1. Scaffold in the repo root (package.json, vite, tsconfig strict, tailwind, eslint). Scripts: dev, build, test, typecheck (tsc --noEmit), check (typecheck + test).
2. Copy seed-data/types.ts, generator.ts, forms.ts, index.ts to src/data/ UNCHANGED. The app imports only from src/data/index.ts and calls buildDataset() (never buildDemoDataset directly - index.ts adds the schema-conformant logbook entries).
3. src/store/demo.ts (zustand):
   - dataset: buildDataset() once (lazy, memoised).
   - demoNow: number, starts at dataset.meta.to, advanced by a ticker (x1 real time; x10 / x60 accelerated modes for the logbook demo).
   - overlay: Record<entityId, Partial<entity>> for operator actions (tag reason, fill form field, sign, acknowledge, disposition). Selectors merge dataset + overlay; never mutate dataset.
   - filters: { line, area, assetIds, shift, from, to, product } synced two-way with URL search params.
   - role: 'Operator' | 'Shift Supervisor' | 'Production Manager' | 'QA' | 'Plant Head' | 'Admin' (demo role switcher) and currentUser (from PEOPLE).
   - resetDemo(): clears overlay, resets demoNow.
4. src/lib/time.ts: fmtET(ms, pattern), shift band helpers (A 06:00-18:00, B 18:00-06:00 ET), window presets (Current shift, Last 24 h, Today, Yesterday, 7 d, 30 d) from demoNow in America/New_York, stepSec chooser (<=24h 60s, <=7d 300s, else 900s).
5. src/lib/selectors.ts: typed memoised selectors - eventsInWindow, batchesInWindow, oeeFor(assetIds, window, shift?), paretoFor(line, window, groupByFamily), openItems(now), entriesFor({formNo?, assetId?, line?, shift?, day?, batchId?}), formRecord(formNo, batchId) (groups entries of one batch into a single record ordered by section/row).
6. Unit tests (vitest): A*P*Q equals oee within 0.001; events per asset contiguous and non-overlapping; exactly one ongoing DOWN on L2-WFE-2M with reasonCode E102; shiftOf(06:00 ET)='A', shiftOf(17:59:59 ET)='A', shiftOf(18:00 ET)='B'; EVERY logbookEntries[].fields[].key exists in FORMS for that formNo and section; FORMS has 14 forms and FOR-BIP-004 has a CRASH section repeating 1..4.

Deliver: `npm run dev` shows a placeholder page printing dataset counts (events, batches, entries per form); `npm run check` green.
