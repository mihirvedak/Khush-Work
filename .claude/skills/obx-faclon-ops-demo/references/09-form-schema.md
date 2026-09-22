# 09 - Form Schema Catalog (field level)

Generated from `seed-data/forms.ts` (the source of truth - edit there, then regenerate). The app renders every logbook form **from this schema** (schema-driven renderer); never hand-code a form screen.

**Legend** - Capture: `manual` operator entry, `live` controller/PLC snapshot (read-only + operator acknowledge), `milestone` timestamp derived from a tag rule, `calc` calculated, `genealogy` from batch links, `scale` connected scale, `lims` HPLC/COA, `erp` Acumatica, `system` app-set. Limits without an OBX `limitRef` are **demo limits** (show "Demo limit - pending OBX Quality"). Out-of-limit blocks submit until comment + deviation link.

Entry value shape (in `logbookEntries[].fields[]`): `{ key, label, value, unit, source, outOfLimit, section, row }` - `row` is the repeat index (2-hour check no., crash no., wash no.).

| Form | Title | Rev / effective | Level | Fields | Origin |
|---|---|---|---|---|---|
| FOR-BIP-009 | 1M Distillation Log | Rev. 2 / 2025-11-17 | entry every 2 h | 32 | OBX controlled BPR |
| FOR-BIP-010 | 2M Distillation Log | Rev. 2 / 2025-11-17 | entry every 2 h | 39 | OBX controlled BPR |
| FOR-BIP-004 | Isolation Log | Rev. 7 / 2026-01-16 | batch | 33 | OBX controlled BPR |
| FOR-BIP-003 | D8 Log | Rev. 4 / 2026-02-05 | batch | 29 | OBX controlled BPR |
| FOR-KRT-101 | Extraction Cycle Log | Rev. A (demo) / 2026-09-01 | batch | 20 | Demo format |
| FOR-KRT-102 | LLE / Solvent Log | Rev. A (demo) / 2026-09-01 | entry every 4 h | 16 | Demo format |
| FOR-KRT-103 | Crystallization Batch Log | Rev. A (demo) / 2026-09-01 | batch | 28 | Demo format |
| FOR-KRT-104 | Drum & Weigh Log | Rev. A (demo) / 2026-09-01 | event | 9 | Demo format |
| FOR-KRT-105 | Salt Run Log | Rev. A (demo) / 2026-09-01 | batch | 17 | Demo format |
| LOG-SHIFT | Shift Handover | Rev. A (demo) / 2026-09-01 | shift | 14 | Demo format |
| LOG-EQ-DAILY | Daily Equipment Checklist | Rev. A (demo) / 2026-09-01 | day | 12 | Demo format |
| LOG-CAL | Calibration Log | Rev. A (demo) / 2026-09-01 | event | 10 | Demo format |
| LOG-SOLV | Solvent Inventory (L1 heptane) | Rev. A (demo) / 2026-09-01 | day | 11 | Demo format |
| LOG-CLEAN | Cleaning / Changeover | Rev. A (demo) / 2026-09-01 | event | 9 | Demo format |

---

## FOR-BIP-009 - 1M Distillation Log (Rev. 2, eff. 2025-11-17)

**Purpose:** Record 1M wiped-film deterpenation run: setpoints vs actuals every 2 h, mass in/out, shift handoff.  
**Governing SOP:** SOP-BIP-004 / SOP-BIP-006 (governing scope unresolved)  
**Assets:** L2-WFE-1M  
**Record model:** One record per 1M batch; one entry per 2-hour check row + one close entry  
**Layout:** field list from pre-read; confirm column order against the scanned paper form

### HEADER - Batch header

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `BATCH_ID` | Distillation batch ID | id | genealogy | ERP |  | Y |  | Format 1M-YYMMDD-NN |
| `INPUT_LOTS` | Source crude / WDC lot(s) | multiselect | genealogy | ERP |  | Y |  |  |
| `ASSET` | Equipment | text | system | Calculated |  | Y |  |  |
| `START_TIME` | Run start | datetime | milestone | Calculated |  | Y |  | First STEADY FEED timestamp from state engine |

### HANDOFF - Shift handoff

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `OUT_OPERATOR` | Outgoing operator | esign | manual | Manual |  | Y |  |  |
| `IN_OPERATOR` | Incoming operator | esign | manual | Manual |  | Y |  |  |
| `HANDOFF_TIME` | Handoff time | datetime | manual | Manual |  | Y |  |  |
| `HANDOFF_NOTES` | Handoff notes | longtext | manual | Manual |  |  |  |  |

### CHECK - 2-hour check - repeating Check x1..12

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `CHECK_TIME` | Check time | datetime | system | Calculated |  | Y |  |  |
| `WIPER_SP` | Wiper speed SP | number | live | Controller | rpm | Y | target 300 (demo) | Setpoint read from controller |
| `WIPER_PV` | Wiper speed actual | number | live | Controller | rpm | Y | min 280 max 320 (demo) | tag WIPER_PV |
| `FEED_SP` | Feed rate SP | number | live | Controller | kg/h | Y | target 5 (demo) | Setpoint read from controller |
| `FEED_PV` | Feed rate actual | number | live | Controller | kg/h | Y | min 4 max 6 (demo) | tag FEED_PV |
| `RUNOFF` | Run-off observation | select | manual | Manual |  | Y |  | options: Steady flow / Slow flow / Intermittent / No flow |
| `RUNOFF_TARGET` | Target (per SOP) | text | system | Calculated |  |  |  | Displayed from SOP; confirm column meaning with OBX |
| `VAC_PV` | Vacuum | number | live | Controller | mbar | Y | max 1.5 (demo) | tag VAC_PV |
| `EVAP_SP` | Evaporator temp SP | number | live | Controller | degC | Y | target 150 (demo) | Setpoint read from controller |
| `EVAP_PV` | Evaporator temp actual | number | live | Controller | degC | Y | min 145 max 155 (demo) | tag EVAP_PV |
| `COND_SP` | Condenser temp SP | number | live | Controller | degC | Y | target 50 (demo) | Setpoint read from controller |
| `COND_PV` | Condenser temp actual | number | live | Controller | degC | Y | min 45 max 55 (demo) | tag COND_PV |
| `CHL_SP` | Chiller temp SP | number | live | Controller | degC | Y | target -10 (demo) | Setpoint read from controller |
| `CHL_PV` | Chiller temp actual | number | live | Controller | degC | Y | min -15 max -5 (demo) | tag CHL_PV |
| `ACK` | Operator acknowledges auto values | attest | manual | Manual |  | Y |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

### CLOSE - Mass & timing (batch close)

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `MASS_IN` | Mass in | number | scale | Scale | kg | Y |  |  |
| `MASS_DIST` | Mass distillate (terpene cut) | number | scale | Scale | kg | Y |  |  |
| `MASS_RES` | Mass residue (run-off to 2M) | number | scale | Scale | kg | Y |  |  |
| `MASS_BAL` | Mass balance | number | calc | Calculated | % | Y | min 97 max 101 (demo) | (distillate + residue) / mass in x 100 |
| `STOP_TIME` | Run stop | datetime | milestone | Calculated |  | Y |  |  |
| `RUN_H` | Total run time | number | calc | Calculated | h | Y |  | Sum of RUN time in STEADY FEED |

### EXCEPTIONS - Exceptions

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `DEV_REF` | Deviation reference | link | manual | Manual |  |  |  |  |
| `COMMENTS` | Comments | longtext | manual | Manual |  |  |  |  |

**Sign-off:** Perform (Operator) -> Review (Shift Supervisor) -> Approve (QA)

**Blocking rules:**
- Any live value outside min/max blocks submit until comment + deviation link
- Check row cannot be submitted > 30 min after due without late-entry reason

**Escalation:** Logbook entry overdue (2-h check): Operator @ due+10 min, Supervisor @ +30 min, Production Manager @ +2 h

---

## FOR-BIP-010 - 2M Distillation Log (Rev. 2, eff. 2025-11-17)

**Purpose:** Record 2M WFE / FSD distillation run (constraint asset): 2-hour checks, oil additions, distillate mass and potency.  
**Governing SOP:** SOP-BIP-004 / SOP-BIP-006 (governing scope unresolved)  
**Assets:** L2-WFE-2M  
**Record model:** One record per 2M batch; one entry per 2-hour check row + oil additions + one close entry  
**Layout:** field list from pre-read; confirm column order against the scanned paper form

### HEADER - Batch header

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `BATCH_ID` | Distillation batch ID | id | genealogy | ERP |  | Y |  | Format 2M-YYMMDD-NN |
| `INPUT_LOTS` | Source 1M residue lot(s) | multiselect | genealogy | ERP |  | Y |  |  |
| `ASSET` | Equipment | text | system | Calculated |  | Y |  |  |
| `START_TIME` | Run start | datetime | milestone | Calculated |  | Y |  | First STEADY FEED timestamp from state engine |

### HANDOFF - Shift handoff

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `OUT_OPERATOR` | Outgoing operator | esign | manual | Manual |  | Y |  |  |
| `IN_OPERATOR` | Incoming operator | esign | manual | Manual |  | Y |  |  |
| `HANDOFF_TIME` | Handoff time | datetime | manual | Manual |  | Y |  |  |
| `HANDOFF_NOTES` | Handoff notes | longtext | manual | Manual |  |  |  |  |

### CHECK - 2-hour check - repeating Check x1..12

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `CHECK_TIME` | Check time | datetime | system | Calculated |  | Y |  |  |
| `WIPER_SP` | Wiper speed SP | number | live | Controller | rpm | Y | target 300 (demo) | Setpoint read from controller |
| `WIPER_PV` | Wiper speed actual | number | live | Controller | rpm | Y | min 280 max 320 (demo) | tag WIPER_PV |
| `FEED_SP` | Feed rate SP | number | live | Controller | kg/h | Y | target 3.5 (demo) | Setpoint read from controller |
| `FEED_PV` | Feed rate actual | number | live | Controller | kg/h | Y | min 3 max 4 (demo) | tag FEED_PV |
| `RUNOFF` | Run-off observation | select | manual | Manual |  | Y |  | options: Steady flow / Slow flow / Intermittent / No flow |
| `RUNOFF_TARGET` | Target (per SOP) | text | system | Calculated |  |  |  | Displayed from SOP; confirm column meaning with OBX |
| `VAC_PV` | Vacuum | number | live | Controller | mbar | Y | max 0.05 (demo) | tag VAC_PV |
| `EVAP_SP` | Evaporator temp SP | number | live | Controller | degC | Y | target 175 (demo) | Setpoint read from controller |
| `EVAP_PV` | Evaporator temp actual | number | live | Controller | degC | Y | min 170 max 180 (demo) | tag EVAP_PV |
| `COND_SP` | Condenser temp SP | number | live | Controller | degC | Y | target 70 (demo) | Setpoint read from controller |
| `COND_PV` | Condenser temp actual | number | live | Controller | degC | Y | min 65 max 75 (demo) | tag COND_PV |
| `CHL_SP` | Chiller temp SP | number | live | Controller | degC | Y | target -15 (demo) | Setpoint read from controller |
| `CHL_PV` | Chiller temp actual | number | live | Controller | degC | Y | min -20 max -10 (demo) | tag CHL_PV |
| `ACK` | Operator acknowledges auto values | attest | manual | Manual |  | Y |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

### OIL - Oil added - repeating Addition x0..6

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `OIL_TIME` | Oil-added time | datetime | manual | Manual |  | Y |  |  |
| `OIL_KG` | Oil added | number | scale | Scale | kg | Y |  |  |
| `OIL_CONFIRM` | Oil addition confirmed | attest | manual | Manual |  | Y |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

### CLOSE - Mass & timing (batch close)

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `MASS_IN` | Mass in | number | scale | Scale | kg | Y |  |  |
| `MASS_DIST` | Mass distillate | number | scale | Scale | kg | Y |  |  |
| `MASS_RES` | Mass residue | number | scale | Scale | kg | Y |  |  |
| `MASS_BAL` | Mass balance | number | calc | Calculated | % | Y | min 97 max 101 (demo) | (distillate + residue) / mass in x 100 |
| `STOP_TIME` | Run stop | datetime | milestone | Calculated |  | Y |  |  |
| `RUN_H` | Total run time | number | calc | Calculated | h | Y |  | Sum of RUN time in STEADY FEED |

### DISTILLATE - Distillate quality

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `POTENCY` | Distillate potency (total cannabinoids) | number | lims | LIMS/COA | % | Y | min 85 (demo) |  |
| `D9_THC` | Delta-9 THC | number | lims | LIMS/COA | % w/w | Y | max 0.3 (demo) | Hold if above limit (QL2-05) |
| `COLOUR` | Distillate colour | select | manual | Manual |  | Y |  | options: Light gold / Gold / Amber / Dark |

### EXCEPTIONS - Exceptions

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `DEV_REF` | Deviation reference | link | manual | Manual |  |  |  |  |
| `COMMENTS` | Comments | longtext | manual | Manual |  |  |  |  |

**Sign-off:** Perform (Operator) -> Review (Shift Supervisor) -> Approve (QA)

**Blocking rules:**
- Vacuum > 0.05 mbar blocks submit until comment + deviation
- D9 THC above limit forces batch HOLD (QA only can release)

**Escalation:** Same as FOR-BIP-009; constraint-asset downtime linked from entry

---

## FOR-BIP-004 - Isolation Log (Rev. 7, eff. 2026-01-16)

**Purpose:** Record CBD isolation: charge, each crash (up to 4), -18 degC endpoint, rinses, trays / oven, isolate mass, visual checks.  
**Governing SOP:** SOP-BIP-003  
**Assets:** L2-ISO-A, L2-ISO-B, L2-ISO-C, L2-ISO-D, L2-ISO-E  
**Record model:** One record per reactor batch; one crash block per crash (batch IDs ...-C1..C4)  
**Layout:** field list from pre-read; confirm column order against the scanned paper form

### HEADER - Header

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `REACTOR` | Reactor | select | system | Calculated |  | Y |  | options: ISO-A / ISO-B / ISO-C / ISO-D / ISO-E |
| `BATCH_ID` | Isolation batch ID | id | genealogy | ERP |  | Y |  | Format ISO-X-YYMMDD-NN-Cn |
| `INPUT_LOTS` | Input distillate lot(s) | multiselect | genealogy | ERP |  | Y |  |  |
| `INPUT_KG` | Input mass | number | scale | Scale | kg | Y |  |  |

### CHARGE - Solvent charge

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `HEP_CALC_L` | Heptane charge - calculated | number | calc | Calculated | L | Y |  | Input kg x 2.5 L/kg (demo factor) |
| `HEP_ACT_L` | Heptane charge - actual | number | manual | Manual | L | Y |  | Within +/-2 % of calculated |

### CRASH - Crash - repeating Crash x1..4

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `CRASH_NO` | Crash no. | number | system | Calculated |  | Y | min 1 max 4 (demo) |  |
| `DISSOLVE_T` | Dissolve temperature | number | live | Controller | degC | Y |  | tag T_INT |
| `DISSOLVE_TIME` | Dissolve complete | datetime | milestone | Calculated |  | Y |  |  |
| `COOL_START` | Start cooling time | datetime | milestone | Calculated |  | Y |  |  |
| `REACHED_M18` | Time internal temp reached -18 degC | datetime | milestone | Controller |  | Y |  | First time T_INT <= -18.0 degC for 5 consecutive minutes; tag T_INT |
| `HOLD_START` | Hold start | datetime | milestone | Calculated |  | Y |  |  |
| `HOLD_END` | Hold end | datetime | milestone | Calculated |  | Y |  |  |
| `CRASH_END_T` | Crash endpoint temperature | number | calc | Calculated | degC | Y | max -18 (SOP-BIP-003) | Mean T_INT over last 30 min of HOLD |
| `TRANSFER_TIME` | Transfer / filter time | datetime | manual | Manual |  | Y |  |  |
| `RINSE1_L` | Rinse 1 volume | number | manual | Manual | L | Y |  |  |
| `RINSE1_TIME` | Rinse 1 time | datetime | manual | Manual |  | Y |  |  |
| `RINSE2_L` | Rinse 2 volume | number | manual | Manual | L | Y |  |  |
| `RINSE2_TIME` | Rinse 2 time | datetime | manual | Manual |  | Y |  |  |
| `RINSE3_L` | Rinse 3 volume | number | manual | Manual | L | Y |  |  |
| `RINSE3_TIME` | Rinse 3 time | datetime | manual | Manual |  | Y |  |  |
| `FLUFF_MIX` | Fluff / mix done | attest | manual | Manual |  | Y |  |  |
| `TRAY_IN` | Tray in time | datetime | manual | Manual |  | Y |  |  |
| `TRAY_OUT` | Tray out time | datetime | manual | Manual |  | Y |  |  |
| `OVEN_ID` | Vacuum oven | select | manual | Manual |  | Y |  | options: VO-01 / VO-02 |
| `ISOLATE_KG` | Isolate mass out | number | scale | Scale | kg | Y |  |  |
| `YIELD_PCT` | Crash yield | number | calc | Calculated | % | Y |  | Isolate kg / input kg x 100 |
| `VIS_COLOUR` | Visual - colour | select | manual | Manual |  | Y |  | Operator judgement per SOP - never automated; options: White / Off-white / Yellow |
| `VIS_DRYNESS` | Visual - dryness | select | manual | Manual |  | Y |  | options: Dry / Slightly damp / Wet |
| `VIS_CONDITION` | Visual - material condition | select | manual | Manual |  | Y |  | options: Free-flowing crystals / Clumped / Glassy / oiled out |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

### NOTES - Notes / exceptions

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `DEV_REF` | Deviation reference | link | manual | Manual |  |  |  |  |
| `NOTES` | Notes | longtext | manual | Manual |  |  |  |  |

**Sign-off:** Perform (Operator) -> Review (Shift Supervisor) -> Approve (QA)

**Blocking rules:**
- Crash endpoint > -18 degC blocks close until deviation raised (Critical)
- Visual fields cannot be auto-filled
- Yellow isolate forces Quality Loss record QL2-07

**Escalation:** Critical deviation: Operator + Supervisor + QA at T+0; Production Manager @ 15 min unacknowledged

---

## FOR-BIP-003 - D8 Log (Rev. 4, eff. 2026-02-05)

**Purpose:** Record Delta-8 conversion: recipe, pre-acid temperature, acid addition, exotherm, cook in band, three washes, output.  
**Governing SOP:** SOP-BIP-005  
**Assets:** L2-RXN-1, L2-RXN-3  
**Record model:** One record per reaction batch (D8-YYMMDD-NN)  
**Layout:** field list from pre-read; confirm column order against the scanned paper form

### HEADER - Header

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `REACTION_ID` | Reaction ID | id | genealogy | ERP |  | Y |  | Format D8-YYMMDD-NN |
| `REACTOR` | Reactor | select | system | Calculated |  | Y |  | options: RXN-1 / RXN-3 |
| `INPUT_LOTS` | Input isolate lot(s) | multiselect | genealogy | ERP |  | Y |  |  |
| `INPUT_KG` | Input mass | number | scale | Scale | kg | Y |  |  |

### RECIPE - Recipe (guided)

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `HEP_CALC_L` | Heptane - calculated | number | calc | Calculated | L | Y |  | Input kg x 4.0 L/kg (demo factor per SOP-BIP-005) |
| `HEP_ACT_L` | Heptane - actual | number | manual | Manual | L | Y |  |  |
| `ACID_CALC_KG` | Acid - calculated | number | calc | Calculated | kg | Y |  | Input kg x 0.05 (demo factor per SOP-BIP-005) |
| `ACID_ACT_KG` | Acid - actual | number | manual | Manual | kg | Y |  | Within +/-2 % of calculated |

### MILESTONES - Reaction milestones

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `MATERIAL_IN` | Material-in time | datetime | milestone | Calculated |  | Y |  |  |
| `PRE_ACID_T` | Pre-acid temperature | number | live | Controller | degC | Y | min 50 max 55 (SOP-BIP-005) | tag T_INT |
| `ACID_IN` | Acid-in time (attest) | datetime | manual | Manual |  | Y |  |  |
| `ACID_ATTEST` | Acid addition performed per SOP | attest | manual | Manual |  | Y |  |  |
| `EXO_PEAK_T` | Exotherm peak temperature | number | milestone | Calculated | degC | Y | max 78 (demo) | Max T_INT in EXOTHERM phase |
| `EXO_PEAK_TIME` | Exotherm peak time | datetime | milestone | Calculated |  | Y |  |  |
| `EXO_RISE` | Exotherm rise | number | calc | Calculated | degC | Y |  | Peak - pre-acid temperature |
| `EXO_TTP` | Time to peak | number | calc | Calculated | min | Y |  |  |
| `SET_TEMP` | Cook set temperature | number | live | Controller | degC | Y | target 90 (demo) |  |
| `COOK_START` | Cook start | datetime | milestone | Calculated |  | Y |  |  |
| `COOK_END` | Cook end | datetime | milestone | Calculated |  | Y |  |  |
| `COOK_IN_BAND` | Cook time in 85-95 degC band | number | calc | Calculated | % | Y | min 95 (SOP-BIP-005) | Minutes with 85 <= T_INT <= 95 / cook minutes x 100 |

### WASH - Wash - repeating Wash x3..3

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `WASH_NO` | Wash no. | number | system | Calculated |  | Y |  |  |
| `WASH_DONE` | Wash performed | attest | manual | Manual |  | Y |  |  |
| `WASH_PH` | Aqueous pH | number | manual | Manual | pH | Y | min 6.5 max 8 (demo) rows [3] | Limit applies to wash 3 |
| `WASH_TIME` | Wash time | datetime | manual | Manual |  | Y |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

### CLOSE - Close

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `OUTPUT_KG` | Output mass | number | scale | Scale | kg | Y |  |  |
| `YIELD_PCT` | Yield | number | calc | Calculated | % | Y |  |  |
| `NOTES` | Notes | longtext | manual | Manual |  |  |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

**Sign-off:** Perform (Operator) -> Review (Shift Supervisor) -> Approve (QA)

**Blocking rules:**
- Pre-acid temperature outside 50-55 degC blocks acid-in attest (Major deviation)
- Cook in-band < 95 % requires comment
- All 3 washes mandatory before close

**Escalation:** Major deviation: Operator, Supervisor @ 15 min, QA @ 1 h, Production Manager @ 4 h

---

## FOR-KRT-101 - Extraction Cycle Log (Rev. A (demo), eff. 2026-09-01)

**Purpose:** One extraction cycle on the outdoor pad: charge, PLC step times, liquor temp/pH, drain and totes filled.  
**Governing SOP:** OBX kratom extraction work instruction (number TBC)  
**Assets:** L1-EXT-T01, L1-EXT-T02, L1-EXT-T03, L1-EXT-T04  
**Record model:** One record per extraction cycle (KX-Txx-YYMMDD-n)  
**Layout:** field list from pre-read; confirm column order against the scanned paper form

### HEADER - Header

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `CYCLE_ID` | Extraction cycle ID | id | genealogy | ERP |  | Y |  |  |
| `TANK` | Extraction tank | select | system | Calculated |  | Y |  | options: T01 / T02 / T03 / T04 |
| `BIOMASS_LOT` | Biomass lot | scan | genealogy | ERP |  | Y |  |  |
| `CHARGE_KG` | Biomass charge | number | scale | Scale | kg | Y |  |  |

### STEPS - PLC step times

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `FILL_START` | Fill start | datetime | milestone | PLC |  | Y |  |  |
| `SOAK_START` | Soak start | datetime | milestone | PLC |  | Y |  |  |
| `RECIRC_START` | Recirculation start | datetime | milestone | PLC |  | Y |  |  |
| `DRAIN_START` | Drain start | datetime | milestone | PLC |  | Y |  |  |
| `DRAIN_END` | Drain end | datetime | milestone | PLC |  | Y |  |  |
| `CYCLE_H` | Cycle time | number | calc | Calculated | h | Y | target 8 (demo) |  |

### PROCESS - Liquor

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `LIQ_TEMP` | Liquor temperature (recirc avg) | number | live | PLC | degC | Y | min 55 max 65 (demo) | tag TEMP |
| `LIQ_PH` | Liquor pH (end of recirc) | number | live | PLC | pH | Y | min 3 max 4 (demo) | tag PH |
| `RECIRC_FLOW` | Recirculation flow (avg) | number | live | PLC | L/min | Y | min 150 max 210 (demo) | tag RECIRC_FLOW |
| `DRAIN_L` | Drain volume | number | calc | PLC | L | Y |  | Level delta x tank volume |
| `TOTE_IDS` | Totes filled | scan | manual | Manual |  | Y |  |  |
| `DISC_MIN` | Edge data gap back-filled | number | system | Calculated | min |  |  | Outdoor-pad network loss; values back-filled from I/O Connect buffer |

### CLOSE - Close

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `WEATHER_HOLD` | Weather hold during cycle | boolean | manual | Manual |  | Y |  |  |
| `WEATHER_REASON` | Weather hold reason | select | manual | Manual |  |  |  | options: Lightning / Freeze / High wind / Heavy rain |
| `NOTES` | Notes | longtext | manual | Manual |  |  |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

**Sign-off:** Perform (Operator) -> Review (Shift Supervisor)

**Blocking rules:**
- Liquor pH outside 3.0-4.0 requires comment (QL1-03 rework)

**Escalation:** Edge DISC > 10 min: OBX IT/OT + Faclon support, Supervisor @ 30 min

---

## FOR-KRT-102 - LLE / Solvent Log (Rev. A (demo), eff. 2026-09-01)

**Purpose:** Liquid-liquid extraction and heptane recovery readings every 4 h - feeds the heptane-loss-per-kg-MIT KPI.  
**Governing SOP:** OBX LLE / solvent recovery work instruction (number TBC)  
**Assets:** L1-LLE-01, L1-SRU-01  
**Record model:** One entry every 4 h while LLE is in CONTACT  
**Layout:** field list from pre-read; confirm column order against the scanned paper form

### LLE - LLE skid

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `CHECK_TIME` | Check time | datetime | system | Calculated |  | Y |  |  |
| `LLE_BATCH` | LLE campaign | id | genealogy | ERP |  | Y |  |  |
| `ORG_FLOW` | Organic (heptane) flow | number | live | Controller | L/min | Y | min 18 max 26 (demo) | tag ORG_FLOW |
| `AQ_FLOW` | Aqueous flow | number | live | Controller | L/min | Y | min 34 max 46 (demo) | tag AQ_FLOW |
| `OA_RATIO` | O/A ratio | number | calc | Calculated |  | Y | min 0.45 max 0.6 (demo) | Organic flow / aqueous flow |
| `AQ_PH` | Aqueous pH | number | live | Controller | pH | Y | min 9.4 max 10.2 (demo) | tag AQ_PH |
| `INTERFACE` | Interface observation | select | manual | Manual |  | Y |  | options: Sharp / Rag layer < 1 cm / Rag layer > 1 cm |
| `EMULSION` | Emulsion present | boolean | manual | Manual |  | Y |  |  |
| `HEP_IN_L` | Heptane to LLE (since last check) | number | calc | Controller | L | Y |  | Totaliser delta |

### SRU - Solvent recovery

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `REB_TEMP` | Reboiler temperature | number | live | Controller | degC | Y | min 97 max 104 (demo) | tag REB_TEMP; assets: L1-SRU |
| `COND_OUT` | Condenser outlet temperature | number | live | Controller | degC | Y | max 30 (demo) | tag COND_OUT; assets: L1-SRU |
| `HEP_REC_L` | Heptane recovered (since last check) | number | calc | Controller | L | Y |  |  |
| `HEP_T01_PCT` | Heptane tank HEP-T01 level | number | manual | Manual | % | Y |  |  |
| `HEP_T02_PCT` | Heptane tank HEP-T02 level | number | manual | Manual | % | Y |  |  |
| `REC_PURITY` | Recovered heptane purity | number | manual | Manual | % | Y | min 98 (demo) |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

**Sign-off:** Perform (Operator) -> Review (Shift Supervisor)

**Blocking rules:**
- Emulsion = Yes requires Quality Loss QL1-04 or comment
- Condenser outlet > 30 degC raises Minor deviation (solvent slip)

**Escalation:** Heptane loss > target for lot: Production Manager on lot close; Plant Head weekly digest

---

## FOR-KRT-103 - Crystallization Batch Log (Rev. A (demo), eff. 2026-09-01)

**Purpose:** MIT freebase crystallization (pH dose, cool, hold) and Nutsche filtration / drying.  
**Governing SOP:** OBX crystallization work instruction (number TBC)  
**Assets:** L1-CRY-01, L1-CRY-02, L1-FIL-01  
**Record model:** Crystallization section per MCB batch; Filter/dry section per MFD batch (linked by genealogy)  
**Layout:** field list from pre-read; confirm column order against the scanned paper form

### CRYST - Crystallization - applies to L1-CRY

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `BATCH_ID` | Crystallization batch | id | genealogy | ERP |  | Y |  | Format MCB-26-nnnn |
| `CRYSTALLIZER` | Crystallizer | select | system | Calculated |  | Y |  | options: CRY-01 / CRY-02 |
| `SOURCE` | Source LLE campaign(s) / totes | multiselect | genealogy | ERP |  | Y |  |  |
| `CHARGE_KG` | Organic phase charged (MIT equiv.) | number | calc | Calculated | kg | Y |  |  |
| `DOSE_START` | Base dose start | datetime | milestone | Controller |  | Y |  |  |
| `PH_REACHED` | pH 9.3 reached | datetime | milestone | Controller |  | Y |  | PH >= 9.3 for 5 consecutive minutes; tag PH |
| `BASE_RECIPE_L` | Base - recipe volume | number | calc | Calculated | L | Y |  |  |
| `BASE_DOSED_L` | Base - dosed total | number | calc | Controller | L | Y |  | Integral of DOSE_RATE |
| `FINAL_PH` | Final pH | number | live | Controller | pH | Y | min 9.3 max 9.9 (demo) | tag PH |
| `T_HOLD` | Temperature at hold | number | live | Controller | degC | Y | min 2 max 8 (demo) | tag T_INT |
| `HOLD_START` | Hold start | datetime | milestone | Calculated |  | Y |  |  |
| `HOLD_END` | Hold end | datetime | milestone | Calculated |  | Y |  |  |
| `HOLD_H` | Hold duration | number | calc | Calculated | h | Y | min 3.5 max 6 (demo) |  |
| `CRYSTAL_APPEAR` | Crystal appearance | select | manual | Manual |  | Y |  | options: Pale, granular / Fine / slow settling / Dark / off-colour |
| `YIELD_PCT` | Crystallization yield | number | calc | Calculated | % | Y |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

### FILTER - Filtration & drying (Nutsche) - applies to L1-FIL

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `FD_BATCH` | Filter-dryer batch | id | genealogy | ERP |  | Y |  | Format MFD-26-nnnn |
| `SOURCE` | Source crystallization batch(es) | multiselect | genealogy | ERP |  | Y |  |  |
| `FILT_START` | Filtration start | datetime | milestone | Calculated |  | Y |  |  |
| `FILT_END` | Filtration end | datetime | milestone | Calculated |  | Y |  |  |
| `FILT_MIN` | Filtration duration | number | calc | Calculated | min | Y | max 150 (demo) |  |
| `DP_MAX` | Max filter differential pressure | number | live | Controller | bar | Y | max 1.5 (demo) |  |
| `WASH_L` | Heptane cake wash | number | manual | Manual | L | Y |  |  |
| `DRY_TEMP` | Drying temperature (avg) | number | live | Controller | degC | Y | min 40 max 50 (demo) |  |
| `DRY_H` | Drying time | number | calc | Calculated | h | Y |  |  |
| `LOD` | Loss on drying | number | lims | LIMS/COA | % | Y | max 0.5 (demo) |  |
| `DRY_KG` | Dry freebase out | number | scale | Scale | kg | Y |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

**Sign-off:** Perform (Operator) -> Review (Shift Supervisor) -> Approve (QA)

**Blocking rules:**
- Final pH outside 9.3-9.9 requires deviation (links pH-probe calibration LOG-CAL)
- LOD > 0.5 % blocks drumming (QL1-08 rework)

**Escalation:** Major deviation path; batch record review pending: Supervisor @ close+4 h, QA @ +24 h

---

## FOR-KRT-104 - Drum & Weigh Log (Rev. A (demo), eff. 2026-09-01)

**Purpose:** Each MIT freebase drum: scan, gross / tare / net from connected scale, label and seal check.  
**Governing SOP:** OBX drumming & labelling work instruction (number TBC)  
**Assets:** L1-FIL-01  
**Record model:** One entry per drum (FBD-26-nnnn)  
**Layout:** field list from pre-read; confirm column order against the scanned paper form

### DRUM - Drum

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `DRUM_ID` | Drum ID | scan | manual | Manual |  | Y |  | Format FBD-26-nnnn |
| `SOURCE_BATCH` | Source filter-dryer batch | id | genealogy | ERP |  | Y |  |  |
| `GROSS_KG` | Gross weight | number | scale | Scale | kg | Y |  |  |
| `TARE_KG` | Tare weight | number | scale | Scale | kg | Y |  |  |
| `NET_KG` | Net weight | number | calc | Calculated | kg | Y |  | Gross - tare; must match label within +/-0.05 kg |
| `SEAL_NO` | Seal number | text | manual | Manual |  | Y |  |  |
| `LABEL_CHECK` | Label matches drum, batch and net weight | attest | manual | Manual |  | Y |  |  |
| `PHOTO` | Label photo | photo | manual | Manual |  |  |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

**Sign-off:** Perform (Operator) -> Verify (Shift Supervisor)

**Blocking rules:**
- Drum not linked to a released MFD batch cannot be saved (QL1-11 genealogy mismatch)

**Escalation:** Genealogy mismatch: QA + Plant Head at T+0

---

## FOR-KRT-105 - Salt Run Log (Rev. A (demo), eff. 2026-09-01)

**Purpose:** MIT acetate salt formation and vacuum drying.  
**Governing SOP:** OBX salt formation work instruction (number TBC)  
**Assets:** L1-SLT-01, L1-SDR-01  
**Record model:** Salt section per MAS run; Dry section per MSD run  
**Layout:** field list from pre-read; confirm column order against the scanned paper form

### SALT - Salt formation - applies to L1-SLT

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `RUN_ID` | Salt run ID | id | genealogy | ERP |  | Y |  | Format MAS-26-nnnn |
| `DRUMS` | Freebase drums consumed | multiselect | manual | Manual |  | Y |  | Scan each drum |
| `FB_KG` | Freebase charged | number | scale | Scale | kg | Y |  |  |
| `ACID_CALC_KG` | Acetic acid - calculated | number | calc | Calculated | kg | Y |  | Freebase kg x 0.151 (stoichiometric, demo) |
| `ACID_ACT_KG` | Acetic acid - actual | number | manual | Manual | kg | Y |  | Within +/-2 % |
| `T_REACT` | Reaction temperature (avg) | number | live | Controller | degC | Y | min 40 max 50 (demo) | tag T_INT |
| `PH_END` | Final pH | number | manual | Manual | pH | Y | min 4.6 max 5.4 (demo) |  |
| `WET_KG` | Salt output (wet) | number | scale | Scale | kg | Y |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

### DRY - Vacuum drying - applies to L1-SDR

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `DRY_ID` | Dryer run ID | id | genealogy | ERP |  | Y |  | Format MSD-26-nnnn |
| `DRY_TEMP` | Dryer temperature (avg) | number | live | Controller | degC | Y | min 45 max 55 (demo) |  |
| `DRY_VAC` | Dryer vacuum (avg) | number | live | Controller | mbar | Y | max 60 (demo) |  |
| `DRY_H` | Drying time | number | calc | Calculated | h | Y |  |  |
| `LOD` | Loss on drying | number | lims | LIMS/COA | % | Y | max 0.5 (demo) |  |
| `ASSAY` | MIT acetate assay | number | lims | LIMS/COA | % | Y | min 98 (demo) |  |
| `DRY_KG` | Dry salt out | number | scale | Scale | kg | Y |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

**Sign-off:** Perform (Operator) -> Review (Shift Supervisor) -> Approve (QA)

**Blocking rules:**
- Assay < 98.0 % forces Quality Loss QL1-12
- Final pH out of range requires comment

**Escalation:** Batch record review pending: Supervisor @ close+4 h, QA @ +24 h, PM @ +72 h

---

## LOG-SHIFT - Shift Handover (Rev. A (demo), eff. 2026-09-01)

**Purpose:** Per-line shift handover: auto summary from I/O Sense plus supervisor notes; signed by outgoing and incoming supervisor.  
**Governing SOP:** Demo format  
**Assets:** line / per-asset (see appliesTo)  
**Record model:** One record per line per shift  
**Layout:** demo format

### AUTO - Auto summary (read-only)

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `LINE` | Line | select | system | Calculated |  | Y |  | options: L1 / L2 |
| `SHIFT` | Shift | select | system | Calculated |  | Y |  | options: A / B |
| `RUN_H` | Constraint run time | number | calc | Calculated | h | Y |  |  |
| `UNPLANNED_H` | Unplanned downtime (all assets) | number | calc | Calculated | h | Y |  |  |
| `TOP_DT` | Top 3 downtime reasons | longtext | calc | Calculated |  | Y |  |  |
| `UNTAGGED` | Untagged stops | number | calc | Calculated |  | Y | max 0 (demo) |  |
| `QL_KG` | Quality loss | number | calc | Calculated | kg | Y |  |  |
| `OPEN_DEV` | Open deviations | number | calc | Calculated |  | Y |  |  |
| `BATCHES_WIP` | Batches in progress | longtext | calc | Calculated |  | Y |  |  |

### NOTES - Supervisor notes

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `SAFETY` | Safety observations | longtext | manual | Manual |  | Y |  | editable by Shift Supervisor |
| `NOTES` | Handover notes | longtext | manual | Manual |  | Y |  | editable by Shift Supervisor |
| `ACTIONS` | Pending actions | longtext | manual | Manual |  |  |  | editable by Shift Supervisor |
| `OUT_SIGN` | Outgoing supervisor (e-sign) | esign | manual | Manual |  | Y |  | editable by Shift Supervisor |
| `IN_SIGN` | Incoming supervisor (e-sign) | esign | manual | Manual |  | Y |  | editable by Shift Supervisor |

**Sign-off:** Perform (Shift Supervisor) -> Review (Shift Supervisor)

**Blocking rules:**
- Cannot sign while untagged stops > 0 on the shift unless each is acknowledged

**Escalation:** Untagged downtime at shift end: Supervisor @ shift end + 30 min

---

## LOG-EQ-DAILY - Daily Equipment Checklist (Rev. A (demo), eff. 2026-09-01)

**Purpose:** Daily per-asset condition checks. Items shown depend on asset type; photo required on fail.  
**Governing SOP:** Demo format  
**Assets:** line / per-asset (see appliesTo)  
**Record model:** One record per asset per shift  
**Layout:** demo format

### CHECKS - Checks

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `VP_OIL` | Vacuum pump oil level / colour | passfail | manual | Manual |  | Y |  | assets: L2-WFE, L2-VO, L1-SDR, L1-FIL |
| `CHL_GLYCOL` | Chiller glycol level | passfail | manual | Manual |  | Y |  | assets: L2-WFE, L2-ISO, L1-CRY |
| `COLD_TRAP` | Cold trap condition | passfail | manual | Manual |  | Y |  | assets: L2-WFE |
| `WIPER_NOISE` | Wiper / rotor noise & vibration | passfail | manual | Manual |  | Y |  | assets: L2-WFE |
| `PH_BUFFER` | pH probe buffer verification (pH 7 / 10) | passfail | manual | Manual |  | Y |  | assets: L1-CRY, L1-LLE, L1-EXT |
| `SCALE_VERIF` | Scale verification weight | passfail | manual | Manual |  | Y |  | assets: L1-FIL, L2-BUF |
| `AGIT` | Agitator noise / seal | passfail | manual | Manual |  | Y |  | assets: L2-ISO, L2-RXN, L1-CRY, L1-SLT |
| `LEAKS` | Leaks (solvent / utility) | passfail | manual | Manual |  | Y |  |  |
| `HOUSEKEEPING` | Housekeeping | passfail | manual | Manual |  | Y |  |  |
| `PHOTO` | Photo of failed item | photo | manual | Manual |  |  |  | Required when any item = Fail |
| `REMARKS` | Remarks | longtext | manual | Manual |  |  |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

**Sign-off:** Perform (Operator) -> Review (Shift Supervisor)

**Blocking rules:**
- Any Fail requires photo + remark and creates a maintenance request

**Escalation:** Daily checklist not done: Operator @ shift end, Supervisor @ +1 h, Production Manager @ +24 h

---

## LOG-CAL - Calibration Log (Rev. A (demo), eff. 2026-09-01)

**Purpose:** Instrument calibration / verification events (pH probes, RTDs, vacuum gauges, scales).  
**Governing SOP:** Demo format  
**Assets:** line / per-asset (see appliesTo)  
**Record model:** One record per calibration event  
**Layout:** demo format

### CAL - Calibration

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `INSTRUMENT` | Instrument / tag | text | manual | Manual |  | Y |  |  |
| `ASSET` | Asset | text | manual | Manual |  | Y |  |  |
| `STANDARD` | Reference standard ID | text | manual | Manual |  | Y |  |  |
| `AS_FOUND` | As-found reading | number | manual | Manual |  | Y |  |  |
| `AS_LEFT` | As-left reading | number | manual | Manual |  | Y |  |  |
| `REFERENCE` | Reference value | number | manual | Manual |  | Y |  |  |
| `TOLERANCE` | Tolerance (+/-) | number | manual | Manual |  | Y |  |  |
| `RESULT` | Result | passfail | calc | Calculated |  | Y |  | |as-found - reference| <= tolerance |
| `NEXT_DUE` | Next due | datetime | calc | Calculated |  | Y |  |  |
| `TECH` | Technician (e-sign) | esign | manual | Manual |  | Y |  |  |

**Sign-off:** Perform (Operator) -> Approve (QA)

**Blocking rules:**
- As-found fail triggers impact assessment on batches since last pass (links deviations)

**Escalation:** As-found fail: QA at T+0

---

## LOG-SOLV - Solvent Inventory (L1 heptane) (Rev. A (demo), eff. 2026-09-01)

**Purpose:** Daily heptane reconciliation: opening/closing tank levels, receipts, transfers, recovered, calculated loss per kg MIT.  
**Governing SOP:** Demo format  
**Assets:** L1-SRU-01  
**Record model:** One record per production day  
**Layout:** demo format

### BAL - Heptane balance

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `DAY` | Production day | datetime | system | Calculated |  | Y |  |  |
| `OPEN_L` | Opening inventory (HEP-T01 + T02) | number | manual | Manual | L | Y |  |  |
| `RECEIPT_L` | Fresh receipts | number | erp | ERP | L | Y |  |  |
| `RECOVERED_L` | Recovered (SRU totaliser) | number | calc | Controller | L | Y |  |  |
| `TO_LLE_L` | Issued to LLE | number | calc | Controller | L | Y |  |  |
| `TO_WASH_L` | Issued to crystallization / cake wash | number | manual | Manual | L | Y |  |  |
| `CLOSE_L` | Closing inventory | number | manual | Manual | L | Y |  |  |
| `LOSS_L` | Calculated loss | number | calc | Calculated | L | Y |  | Issued to LLE + wash - recovered (tank gap reported separately) |
| `MIT_KG` | MIT freebase produced | number | calc | Calculated | kg | Y |  |  |
| `LOSS_PER_KG` | Heptane loss per kg MIT | number | calc | Calculated | L/kg | Y | max 4 (demo) |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |

**Sign-off:** Perform (Operator) -> Review (Production Manager)

**Blocking rules:**
- Loss per kg above target requires comment

**Escalation:** Heptane loss > target: Production Manager on lot close

---

## LOG-CLEAN - Cleaning / Changeover (Rev. A (demo), eff. 2026-09-01)

**Purpose:** Equipment cleaning and product changeover with release to next batch.  
**Governing SOP:** Demo format  
**Assets:** line / per-asset (see appliesTo)  
**Record model:** One record per CLEAN phase / changeover  
**Layout:** demo format

### CLEAN - Cleaning

| Key | Label | Type | Capture | Source | Unit | Req | Limits | Rule / notes |
|---|---|---|---|---|---|---|---|---|
| `ASSET` | Asset | text | system | Calculated |  | Y |  |  |
| `PREV_BATCH` | Previous batch | id | genealogy | ERP |  | Y |  |  |
| `PREV_PRODUCT` | Previous product | text | genealogy | ERP |  | Y |  |  |
| `METHOD` | Cleaning method | select | manual | Manual |  | Y |  | options: Heptane flush / Ethanol rinse / Hot water + detergent / Dry wipe-down |
| `START` | Start | datetime | milestone | Calculated |  | Y |  |  |
| `END` | End | datetime | milestone | Calculated |  | Y |  |  |
| `VISUAL_CLEAN` | Visually clean | attest | manual | Manual |  | Y |  |  |
| `INITIALS` | Operator initials (e-sign) | esign | manual | Manual |  | Y |  |  |
| `RELEASED_BY` | Released for next batch (e-sign) | esign | manual | Manual |  | Y |  | editable by Shift Supervisor |

**Sign-off:** Perform (Operator) -> Verify (Shift Supervisor)

**Blocking rules:**
- Next batch cannot start on the asset until RELEASED_BY is signed

**Escalation:** None (informational)
