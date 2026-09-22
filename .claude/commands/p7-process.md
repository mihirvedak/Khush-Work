---
description: P7 - Process Parameters, SPC, Golden Tunnel, Deviation Log, Solvent Balance
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

Read 05 fully and 01 parameter tables (units, sources, data states, demo limits).
Build /process with tabs:
1. Live: per asset parameter tiles (valueAt at demoNow) with SourceBadge, limit status, sparkline; WFE-2M dual-axis evaporator temp + vacuum with labelled units.
2. Trends: multi-tag chart, limit hierarchy lines (Spec red dashed / Control blue dotted / Golden band) per 08, state lane underneath synced zoom, annotations for deviations.
3. SPC: X-bar/R (n=5 subgroups, STEADY FEED only) for continuous tags; I-MR for batch endpoints (batch.metrics). Nelson rules 1, 2, 3, 5 flagged with rule numbers. CapabilityPanel (UI-14) with Cp/Cpk/Pp/Ppk, "Indicative" when n < 30, no compute when n < 10, formulas on hover. Compute live via capability(); never hard-code the values in 05.
4. Golden Tunnel: goldenTunnel('L2-ISO','T_INT') band vs % phase, overlay live ISO-C batch leaving the tunnel, contributing batch list with yield/purity; WFE golden operating window scatter (evap temp vs vacuum, coloured by distillate yield) with hull.
5. Deviation Log: table + DeviationCard drawer, workflow Open -> Acknowledged -> Under investigation -> Action taken -> Closed, severity rules, links to downtime event and CAPA.
6. Solvent Balance (L1): heptane Sankey (make-up -> LLE -> SRU -> FIL -> losses) with the 38/27/21/14 split, loss per kg finished MIT KPI, reconciliation table.
Every limit marked demoLimit shows the DEMO tag and tooltip "Demo limit - pending OBX Quality (SOP-BIP-004 / SOP-BIP-006 scope unresolved)".
