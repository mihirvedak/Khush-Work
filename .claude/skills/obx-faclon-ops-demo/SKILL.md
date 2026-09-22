---
name: obx-faclon-ops-demo
description: Build, extend or review the Faclon I/O Sense client demo for Open Book Extracts (OBX, Roxboro NC) - two process lines (L1 Kratom/MIT, L2 Bulk Cannabinoids) with Machine Timeline, Downtime Logger, Rejection Logger, batch-aware OEE, Process Parameter / SPC dashboard (Cp, Cpk, Pp, Ppk, golden tunnel, deviation log), and Digital Logbooks (FOR-BIP-009/010/004/003 + Kratom logs) with escalation matrix. Trigger on "OBX", "Open Book Extracts", "kratom", "mitragynine", "MIT", "WFE", "wiped film", "CBD isolate", "Delta-8", "ISO-A", "RXN-1", "machine timeline", "downtime logger", "rejection logger", "golden tunnel", "logbook", or any request to generate screens, data or copy for this demo.
---

# OBX x Faclon - Operations Demo Skill

## What this skill is for

A click-through demo (React + TypeScript + Vite) that shows OBX how Faclon's
I/O Sense stack would look **on their own plant**: their two lines, their
equipment names, their paper forms, their parameters, their business questions.
Every screen must feel like OBX data on a Tuesday morning, not a generic
manufacturing template.

The demo is a sales artefact built on **synthetic data**. It must never claim
to be OBX's real data, and every numeric limit is a DEMO VALUE until OBX
Quality confirms it (see `references/01-line-knowledge.md` -> Assumptions).

## Read order (do not work from memory)

| Task | Read |
|---|---|
| Anything at all | `references/00-solution-overview.md` (IA, storyline, module map, hard rules) |
| Any screen that names an asset, parameter, reason or batch | `references/01-line-knowledge.md` (the single source of truth for the plant model) |
| Machine Timeline screen | `02-machine-timeline.md` |
| Downtime Logger / Rejection Logger | `03-downtime-rejection-loggers.md` |
| OEE dashboards | `04-oee-dashboard.md` |
| Process parameters, SPC, Cp/Cpk, golden tunnel, deviations | `05-process-parameters-spc.md` |
| Logbooks, forms, e-signature, escalation | `06-logbooks-escalation.md` + `09-form-schema.md` (every field) + `seed-data/forms.ts` |
| Types, IDs, dummy data, generator | `07-data-model-dummy-data.md` + `seed-data/index.ts` (import from here) |
| Colours, type, components, charts | `08-design-theme.md` |
| Build order / module prompts | `/prompts/BUILD-PROMPTS.md` and slash commands `/p0-scaffold` ... `/p10-polish` |

## Stack (fixed)

- React 18 + TypeScript (strict) + Vite
- Tailwind CSS with the Faclon tokens in `08-design-theme.md` (CSS variables, no hard-coded hex in components)
- Charts: Apache ECharts (`echarts-for-react`) - needed for custom-series timelines, dataZoom brushing, markArea bands and 10k+ point series. Do not mix chart libraries.
- Tables: TanStack Table v8 (virtualised with `@tanstack/react-virtual` for the 80k-row event tables)
- State: Zustand for global filters (site / line / asset / shift / date range); React Query only if a mock API is added
- Dates: `date-fns` + `date-fns-tz`, plant timezone **America/New_York**
- Data: `seed-data/index.ts` -> `buildDataset()` (seeded, deterministic, logbooks conform to `FORMS`) - same seed = same demo every time. Copied to `src/data/` in P0; never edit the copies except `forms.ts`.

## Hard rules

1. **Names are sacred.** Use the asset IDs, form numbers (FOR-BIP-xxx, SOP-BIP-xxx), stage names and reason codes exactly as in `01-line-knowledge.md`. Never invent a new asset or form number in a screen.
2. **Batch-aware OEE.** L2 reactors and L1 crystallizers are batch equipment. OEE Performance uses ideal batch cycle time, not "parts per minute". Yield is a separate KPI and is never folded into OEE Quality (see `04`).
3. **Every number traces to a source badge.** Each value shows where it came from: `PLC`, `Controller`, `Scale`, `Manual`, `Calculated`, `LIMS/COA`, `ERP`. This is the OBX story (paper -> connected).
4. **Operator judgement stays manual.** Visual checks (colour, dryness, material condition), critical additions and attestations are operator actions with initials/e-sign, even when equipment values auto-populate (pre-read "hybrid eBPR").
5. **No control writes.** The demo never shows Faclon writing setpoints to the Beckhoff PLC or any controller. Read-only, analytics only (pre-read architecture principle).
6. **Preserve OBX identities.** Batch, lot, tote, drum and salt-run IDs follow OBX genealogy formats in `07`; Faclon never creates a parallel batch ID.
7. **Demo labelling.** A persistent "Demo data - synthetic" chip in the top bar. Limits show a "Demo limit - pending OBX Quality" tooltip.
8. **Accessibility.** State is never colour-only: timeline segments carry pattern/label on hover, status chips carry text, contrast >= 4.5:1.
9. **Time.** Store UTC ISO strings, render America/New_York, 24 h clock `YYYY-MM-DD HH:mm:ss`. An open event shows an `Ongoing` chip - never `NaT`, `null` or blank.
10. **Forms are schema-driven.** Logbook screens render from `FORMS` (forms.ts). Never hand-build a form screen or invent a field key.
