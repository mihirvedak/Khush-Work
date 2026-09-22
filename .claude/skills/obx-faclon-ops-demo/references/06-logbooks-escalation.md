# 06 - Digital Logbooks (hybrid eBPR) & Escalation Matrix

## Principles (from pre-read)
- **Hybrid**: equipment values auto-populate; operators attest material-condition observations, critical additions, exceptions and handoffs; Quality controls templates, audit trail, corrections, approvals, retention, e-signatures.
- The scheduled human review/initials is kept as an **acknowledgement**, not duplicate transcription.
- Templates are **versioned controlled documents** (form number + revision + effective date). A running record stays on the revision it started with.
- Part 11-ready design (unique user, e-sign = user + password re-entry + meaning, audit trail, no delete) - whether OBX needs formal 21 CFR Part 11 is an onsite question; design for it anyway.

## Screens

### 6.1 Logbook home
```
[Filters: Line | Asset | Shift | Date | Form | Status]
Tabs: My tasks | Shift view | Day view | Batch view | Form library

My tasks: cards - "FOR-BIP-010 2M check due 10:00 (in 12 min)", "FOR-BIP-004 ISO-C - rinse 2 attestation", "Shift handover L2-A due 17:45"
Shift view (grid): rows = assets, columns = time slots of the shift (2 h), cells = entry status (Done / Due / Overdue / Auto-only / N/A)
Day view: completion % per form per line, overdue count, review pending, approval pending
Batch view: batch -> its forms, phases, completion, deviations, status (In progress / Review / Approved / Locked)
```
Status colours: Done green, Due blue, Overdue red, Review pending amber, Approved dark green with lock, Rejected-for-correction purple.

### 6.2 Form entry (tablet-first)
- Header: form no., title, revision, effective date, asset, batch, shift, operator, "Started 06:12".
- Field rows show a **source badge**: `AUTO - PLC 10:00:04` (read-only, with "Confirm" tick), `AUTO - Scale`, `MANUAL`, `CALC`.
- If an auto value is outside limits, the field turns red and **requires** a comment + raises/links a deviation.
- Attestation fields: checkbox + initials (e-sign) + time.
- Corrections after save: strike-through old value, new value, reason-for-change (picklist + text), user, time. Never overwrite.
- Offline-capable (outdoor pad): queue entries locally, sync badge.

### 6.3 Review & approval
Operator submit -> Supervisor verify (e-sign "Reviewed") -> QA approve (e-sign "Approved") -> Locked. "Return for correction" sends back with comment. Review screen highlights exceptions only (out-of-limit, late, corrected, manual overrides) - this is where review time drops.

---

## Form library

> Field-level source of truth: `09-form-schema.md` (generated from `seed-data/forms.ts`). The tables below are the narrative summary; where they differ, 09 / forms.ts wins.

### L2 - controlled forms (render field-for-field)

**FOR-BIP-009 - 1M Distillation Log (Rev. 2 - 17NOV2025)** - asset L2-WFE-1M - frequency: header per batch/shift, checks every 2 h
| Section | Field | Type | Source |
|---|---|---|---|
| Shift handoff | Outgoing operator / incoming operator / time / notes | e-sign x2, text | Manual |
| Batch | Batch ID, source crude lot(s) | ID | Genealogy |
| Mass | Mass in (kg), mass distillate (terpene cut), mass residue (run-off) | number | Scale (AUTO) |
| Timing | Start time, stop time, total run h | time | AUTO (state) |
| 2-hour check (repeating row) | Time; Wiper SP/Actual (rpm); Feed SP/Actual (kg/h); Run-off; Target; Vacuum (mbar); Evaporator SP/Actual (degC); Condenser SP/Actual; Chiller SP/Actual; Initials | number, e-sign | AUTO values + operator acknowledgement |
| Exceptions | Deviation ref, comments | link, text | Manual |

**FOR-BIP-010 - 2M Distillation Log (Rev. 2 - 17NOV2025)** - asset L2-WFE-2M - same as 009 plus:
| Section | Field | Type | Source |
|---|---|---|---|
| Oil added | Oil-added confirmation (time, qty, initials) | attest | Manual + Scale |
| Distillate | Distillate potency (HPLC), D9 THC | number | LIMS (AUTO later) |
Note banner: "Governing distillation SOP (SOP-BIP-004 vs SOP-BIP-006) pending OBX Quality confirmation - limits shown are demo."

**FOR-BIP-004 - Isolation Log (Rev. 7 - Effective 16JAN2026)** - assets L2-ISO-A..E, L2-BUF-01, L2-VO-0x - per batch, up to 4 crashes
| Section | Field | Type | Source |
|---|---|---|---|
| Header | Reactor (A-E), batch ID, input distillate lot, input mass (kg) | select, number | Genealogy, Scale |
| Charge | Heptane charge (L) - calc vs actual | number | CALC + Manual/flow |
| Per crash (1..4, repeating block) | Crash no.; dissolve temp & time; start cooling time; time internal temp reached -18 degC (**AUTO milestone from T_INT**); hold start/end; transfer time; rinse 1/2/3 (vol, time, initials); fluff/mix done (attest); tray in / tray out time; oven ID; isolate mass out; visual check (colour, dryness, material condition) - **operator attest**; initials | mixed | AUTO milestones + operator |
| Notes | Notes / exceptions | text | Manual |
Auto rule: "-18 degC reached" timestamp is captured when T_INT <= -18.0 for 5 consecutive minutes (SOP-BIP-003 objective endpoint). Visual checks remain manual per SOP.

**FOR-BIP-003 - D8 Log (Rev. 4 - Effective 05FEB2026)** - assets L2-RXN-1, L2-RXN-3 - per batch
| Section | Field | Type | Source |
|---|---|---|---|
| Header | Reaction ID, reactor, input isolate lot, input mass (kg) | ID, number | Genealogy, Scale |
| Recipe (guided) | Heptane calc/actual; acid calc/actual (calc from input mass via SOP-BIP-005 factor) | CALC + Manual | CALC |
| Milestones | Material-in time; pre-acid temp (must be 50-55 degC, **AUTO**); acid-in time (attest); exotherm peak temp & time (**AUTO derived**); rise and time-to-peak (**CALC**); set temp and cook start/end (85-95 degC, % time in band **CALC**) | mixed | AUTO + attest |
| Washes | Wash 1/2/3: done (attest), aqueous pH, time, initials | attest, number | Manual |
| Close | Output mass, notes, initials | number, text | Scale, Manual |

### L1 - Kratom forms (demo templates; OBX already has tablet apps - Faclon attaches telemetry to the same records, form numbers are placeholders `FOR-KRT-xxx [DEMO]`)

| Form [DEMO no.] | Asset | Frequency | Key fields |
|---|---|---|---|
| FOR-KRT-101 Extraction Cycle Log | L1-EXT-T01..T04 | per cycle | Lot ID, charge kg, fill/soak/recirc/drain times (AUTO from PLC steps), liquor temp & pH (AUTO), drain volume, tote IDs filled, weather hold (Y/N), initials |
| FOR-KRT-102 LLE / Solvent Log | L1-LLE-01, L1-SRU-01 | every 4 h + per tote | Organic/aqueous flow (AUTO), O/A ratio, interface observation (manual), emulsion Y/N, heptane in (AUTO), recovered heptane (AUTO), tank levels, recovered heptane purity |
| FOR-KRT-103 Crystallization Batch Log | L1-CRY-01/02 | per batch | Source totes, pH curve milestones (AUTO), base dosed total vs recipe, T_INT at hold, hold start/end, visual (crystal appearance) attest, filtration start/end |
| FOR-KRT-104 Drum & Weigh Log | L1-DRM-SC01 | per drum | Drum ID (scan), source batch, gross/tare/net (AUTO scale), label check attest |
| FOR-KRT-105 Salt Run Log | L1-SLT-01, L1-SDR-01 | per run | Drums consumed (scan), freebase kg, acid calc/actual, reaction temp (AUTO), final pH, dryer temp/vacuum/time (AUTO), output kg |

### Both lines - shift & day level

| Form | Level | Fields |
|---|---|---|
| LOG-SHIFT Shift Handover (per line) | Shift | Auto summary (OEE, downtime top 3, quality losses, open deviations, batches in progress) + supervisor notes, safety observations, pending actions; outgoing + incoming e-sign |
| LOG-EQ-DAILY Daily Equipment Checklist | Day, per asset | Vacuum pump oil level/colour (WFE), chiller glycol level, cold-trap condition, pH probe check/buffer verification (CRY, LLE), scale verification weight (drum/receiving scales), agitator noise, leaks, housekeeping - Pass/Fail + photo on fail |
| LOG-CAL Calibration Log | Event | Instrument, standard used, as-found, as-left, pass/fail, next due |
| LOG-SOLV Solvent Inventory (L1) | Day | Opening/closing tank levels, receipts, transfers, calculated loss |
| LOG-CLEAN Cleaning / Changeover | Event | Asset, previous product/batch, cleaning method, verification (visual), released by |

Demo dataset should include one overdue daily checklist (WFE-2M vacuum pump oil check missed on shift B for 3 days) - links to the OEE/downtime story.

---

## Escalation matrix

Configurable per trigger (Settings > Escalations). Channels: in-app notification, email, SMS; Slack notification optional (pre-read: useful for notifications, not a transaction backbone).

| Trigger | L1 (T+0) | L2 | L3 | L4 |
|---|---|---|---|---|
| Unplanned stop on constraint asset (WFE-2M, CRY-01/02) | Operator | Shift Supervisor @ 30 min | Production Manager @ 2 h | Plant Head @ 8 h |
| Unplanned stop, non-constraint | Operator | Supervisor @ 60 min | Production Manager @ 4 h | - |
| Untagged downtime at shift end | Operator | Supervisor @ shift end + 30 min | - | - |
| Critical deviation | Operator + Supervisor + QA (T+0) | Production Manager @ 15 min if not acknowledged | Plant Head @ 1 h if not acknowledged | - |
| Major deviation | Operator | Supervisor @ 15 min unacknowledged | QA @ 1 h | Production Manager @ 4 h |
| Minor deviation / tunnel exit | Operator | Supervisor @ 60 min unacknowledged | - | - |
| Logbook entry overdue (2-h check) | Operator @ due + 10 min | Supervisor @ due + 30 min | Production Manager @ due + 2 h | - |
| Daily checklist not done | Operator @ shift end | Supervisor @ +1 h | Production Manager @ +24 h | - |
| Batch record review pending | Supervisor @ batch close + 4 h | QA @ + 24 h | Production Manager @ + 72 h | - |
| Quality HOLD for D9 THC / 7-OH, any SCRAP | QA + Plant Head (T+0) | - | - | - |
| Edge disconnected (DISC) > 10 min | OBX IT/OT + Faclon support | Supervisor @ 30 min | - | - |
| Heptane loss > target for lot | Production Manager (on lot close) | Plant Head weekly digest | - | - |

Escalation record: ID, trigger, entity link, level reached, notified users, timestamps per level, acknowledged by/at, SLA met (Y/N). Show "Escalation metrics" widget: SLA adherence %, mean time to acknowledge by role, open escalations by level.

## Acceptance criteria
- An out-of-limit auto value blocks submit until comment + deviation link.
- Correction history visible inline; approved records are read-only (lock icon).
- Shift view shows 6 two-hour slots for shift A with correct statuses by current time.
- Escalation timer visibly advances in demo mode (accelerated clock toggle: 1 min = 1 h).
