# 01 - Line Knowledge (single source of truth for the plant model)

Sources: OBX Operations & Data Pre-Read (Sept 2026), "OBX Two Process Lines" deck, Faclon OEE/Logbook solution patterns.
Anything marked **[DEMO]** is a realistic assumption for the demo and must be validated onsite. Anything marked **[OBX]** is stated by OBX.

---

## 0. Plant hierarchy (ISA-95 / ISA-88)

```
Site: OBX Roxboro, NC  (tz America/New_York)
|-- Area: OUTDOOR PAD            -> L1 extraction (Beckhoff PLC + HMI)                 [OBX]
|-- Area: KRATOM PROCESS ROOM    -> L1 LLE, solvent recovery, crystallization, salt    [DEMO naming]
|-- Area: BULK SUITE             -> L2 WFE, isolation reactors, D8 reactors, drying    [DEMO naming]
`-- Area: QC LAB                 -> In-house HPLC; external COAs                        [OBX]

Line L1  Kratom / Mitragynine (MIT)
Line L2  Bulk Cannabinoids
```

Data-state classification (from pre-read walkdown method) used as a badge on every tag:

| Code | Meaning | Badge colour |
|---|---|---|
| DS1 | Structured digital (already electronic, structured) | teal |
| DS2 | Manually entered electronically (tablet app) | blue |
| DS3 | Measured / displayed but not retained | amber |
| DS4 | Not measured today | red outline |
| DSP | Paper record (controlled BPR) | grey |

In the demo, every tag shows **"Today: DSx -> Demo: Connected"** so the before/after is explicit.

---

## 1. Shifts & calendar [DEMO]

| Shift | Hours (ET) | Crew |
|---|---|---|
| A (Day) | 06:00 - 18:00 | Crew 1 / Crew 3 on 2-2-3 rotation |
| B (Night) | 18:00 - 06:00 | Crew 2 / Crew 4 on 2-2-3 rotation |

- L1 outdoor pad extraction: runs 24/7 while a biomass lot is in process; weather holds apply (lightning / freeze).
- L2 Bulk: 24/7 for WFE campaigns; reactors run to batch schedule.
- Planned production time excludes: no-schedule, planned PM, shift handover (15 min each change) - see OEE rules in `04`.
- Demo operators (fictional): A-shift: J. Alvarez, K. Morgan, D. Pritchard (Sup. R. Ellis). B-shift: T. Nguyen, S. Brooks, M. Hale (Sup. L. Carter). QA: Dr. P. Shah. Production Manager: A. Whitfield. Plant Head: C. Donnelly.

---

## 2. LINE L1 - Kratom / MIT

Flow **[OBX]**: Biomass lot -> Pretreatment / extraction -> Extraction tote -> Crystallization batch -> Freebase drum -> Acetate salt run -> QC / inventory
Solvent: heptane (LLE + crystallization). Business question: *heptane loss per kg finished MIT*.
Systems: Tablet apps (Cloud Run) + Cloud SQL genealogy; Beckhoff PLC + HMI (TwinCAT, history not retained); Acumatica ERP; in-house HPLC + external COAs.

### 2.1 Stages & equipment

| # | Stage [OBX] | Equipment ID [DEMO] | Equipment | Area | OEE asset? | Control / source |
|---|---|---|---|---|---|---|
| 1 | Biomass lot | L1-RCV-SC01 | Receiving floor / truck scale | Outdoor pad | No (logistics) | Scale |
| 2 | Pretreatment / extraction | L1-EXT-T01..T04 | Extraction tanks (4) with recirculation pumps L1-EXT-P01..P04 and drain valves | Outdoor pad | **Yes** (each tank) | Beckhoff PLC |
| 2 | LLE / solvent | L1-LLE-01 | Liquid-liquid extraction skid (mixer-settler, organic + aqueous pumps) | Process room | **Yes** | Local ctrl + PLC [validate] |
| 2 | Solvent recovery | L1-SRU-01 | Heptane recovery still (reboiler + condenser), tanks L1-HEP-T01 fresh / L1-HEP-T02 recovered | Process room | **Yes** | Local ctrl |
| 3 | Extraction tote | L1-TOT-SC01 | Tote fill station + scale (1,000 L IBC totes) | Process room | No | Scale + tablet |
| 4 | Crystallization batch | L1-CRY-01, L1-CRY-02 | Jacketed crystallizers with pH probe, base dosing pump (L1-DOS-01/02), chiller L1-CHL-01 | Process room | **Yes** (each) | Local ctrl |
| 4 | Isolation | L1-FIL-01 | Nutsche filter-dryer | Process room | **Yes** | Local ctrl |
| 5 | Freebase drum | L1-DRM-SC01 | Drumming station + scale (gross/tare/net) | Process room | No | Scale + tablet |
| 6 | Acetate salt run | L1-SLT-01 | Salt conversion reactor | Process room | **Yes** | Local ctrl |
| 6 | Salt drying | L1-SDR-01 | Vacuum tray dryer | Process room | **Yes** | Local ctrl |
| 7 | QC / inventory | QC-HPLC-01 | In-house HPLC; Acumatica inventory | QC lab | No | LIMS/COA, ERP |

**L1 constraint (bottleneck) asset for line OEE [DEMO]:** L1-CRY-01/02 (crystallization is "yield-critical" [OBX] and slowest per kg).

### 2.2 Volumes & rates [DEMO - realistic, validate]

| Item | Value | Basis |
|---|---|---|
| Biomass lot size | 14,000 - 17,000 kg | [OBX] |
| Extraction throughput | ~3,200 kg biomass / day across 4 tanks (1 cycle / tank / 8 h, ~1,000 kg charge) | [DEMO] |
| Days to process one lot | 4.5 - 5.5 days | derived |
| Mitragynine content in leaf | 1.2 - 1.8 % w/w | literature range |
| Overall MIT recovery to freebase | 62 - 74 % of theoretical | [DEMO] |
| Freebase per lot | ~140 - 190 kg | derived |
| Crystallization batch size | 28 - 36 kg freebase / batch, 5 - 6 batches per lot | [DEMO] |
| Crystallization ideal cycle | 14 h (charge 1 h, dose 3 h, cool 4 h, hold 4 h, discharge 2 h) | [DEMO] |
| Freebase drum | 25 kg net target (+/-0.2 kg) | [DEMO] |
| Salt run | 30 - 45 kg acetate salt / run, ideal cycle 10 h + drying 18 h | [DEMO] |
| Heptane loss KPI | Demo actual 6.8 - 11.5 L / kg MIT; demo target <= 6.0 | [DEMO] (not measured today [OBX]) |

### 2.3 Process parameters (L1)

Columns: Tag | Parameter | Unit | Today | Demo rate | Target | LSL | USL | Used in
("SPC" = control chart + Cp/Cpk; "GT" = golden tunnel; "OEE" = drives state/rate)

**L1-EXT-T01..T04 - Extraction tanks (Beckhoff)**

| Tag suffix | Parameter | Unit | Today | Rate | Target | LSL | USL | Used in |
|---|---|---|---|---|---|---|---|---|
| .LVL | Tank level | % | DS3 | 10 s | - | 5 | 95 | State, OEE |
| .TEMP | Liquor temperature | degC | DS3 | 10 s | 60 | 55 | 65 | SPC |
| .PH | Liquor pH (acidified extraction) | pH | DS3 | 30 s | 3.5 | 3.0 | 4.0 | SPC |
| .RECIRC_FLOW | Recirculation flow | L/min | DS3 [validate meter] | 10 s | 180 | 150 | 210 | SPC |
| .PUMP_RUN | Recirc pump running | bool | DS3 | event | - | - | - | State |
| .VALVE_DRAIN | Drain valve open | bool | DS3 | event | - | - | - | State (drain phase) |
| .CYCLE_STEP | PLC cycle step (Fill/Soak/Recirc/Drain/Idle) | enum | DS3 | event | - | - | - | Timeline phase |
| .CYCLE_TIME | Cycle duration | h | DS2 | per cycle | 8.0 | - | 9.0 | OEE perf |
| .DRAIN_TIME | Drain duration | min | DS2 | per cycle | 45 | - | 60 | SPC |
| .CHARGE_KG | Biomass charged | kg | DS2 | per cycle | 1,000 | 950 | 1,050 | Yield |

**L1-LLE-01 - LLE skid**

| Tag | Parameter | Unit | Today | Rate | Target | LSL | USL | Used in |
|---|---|---|---|---|---|---|---|---|
| .ORG_FLOW | Organic (heptane) flow | L/min | DS4 (new meter) | 5 s | 22 | 18 | 26 | SPC, solvent balance |
| .AQ_FLOW | Aqueous flow | L/min | DS4 | 5 s | 40 | 34 | 46 | SPC |
| .OA_RATIO | O/A ratio (calc) | - | calc | 5 s | 0.55 | 0.45 | 0.65 | SPC |
| .AQ_PH | Aqueous pH (basified) | pH | DS3 | 30 s | 9.8 | 9.4 | 10.2 | SPC |
| .SETTLER_LVL | Settler level | % | DS3 | 10 s | 60 | 40 | 80 | State |
| .INTERFACE | Interface level | % | DS4 | 10 s | 50 | 40 | 60 | Deviation (rag layer) |
| .SEP_TIME | Phase separation time | min | DS2 | per pass | 20 | - | 35 | SPC |
| .HEP_IN_L | Heptane into skid (totaliser) | L | DS4 | 1 min | - | - | - | Solvent balance |

**L1-SRU-01 - Solvent recovery (heptane)**

| Tag | Parameter | Unit | Today | Rate | Target | LSL | USL | Used in |
|---|---|---|---|---|---|---|---|---|
| .REB_TEMP | Reboiler temperature | degC | DS3 | 10 s | 100 | 97 | 104 | SPC |
| .COND_OUT | Condenser outlet temp | degC | DS3 | 10 s | 22 | - | 30 | SPC (loss driver) |
| .REC_FLOW | Recovered heptane flow | L/h | DS4 | 10 s | 180 | 150 | - | OEE rate |
| .REC_TOTAL | Recovered heptane totaliser | L | DS4 | 1 min | - | - | - | Solvent balance |
| .T01_LVL / .T02_LVL | Fresh / recovered tank level | % | DS3 | 1 min | - | 10 | 90 | Solvent balance |
| .HEP_PURITY | Recovered heptane purity (GC) | % | DS2 | per tank | 99.0 | 98.0 | - | Quality |

**L1-CRY-01 / L1-CRY-02 - Crystallizers** (yield-critical [OBX])

| Tag | Parameter | Unit | Today | Rate | Target | LSL | USL | Used in |
|---|---|---|---|---|---|---|---|---|
| .PH | Batch pH | pH | DS3 | 10 s | endpoint 9.6 | 9.3 | 9.9 | GT, SPC (endpoint) |
| .T_INT | Internal (product) temp | degC | DS3 | 10 s | 5 at hold | 2 | 8 | GT, SPC |
| .T_JKT | Jacket temp | degC | DS3 | 10 s | - | -5 | 25 | GT |
| .DOSE_RATE | Base dosing rate | L/h | DS3 | 10 s | 12 | 8 | 15 | GT, SPC |
| .DOSE_TOTAL | Base dosed total | L | DS2 | per batch | recipe | -5 % | +5 % | Deviation |
| .AGIT | Agitator speed | rpm | DS3 | 10 s | 90 | 70 | 110 | SPC |
| .HOLD_TIME | Hold time at endpoint | h | DS2 | per batch | 4.0 | 3.5 | 6.0 | SPC |
| .COOL_RATE | Cooling rate (calc) | degC/h | calc | 1 min | 4.0 | 2.5 | 5.5 | GT |
| .CHARGE_TOTE | Source tote IDs | - | DS1 | per batch | - | - | - | Genealogy |

**L1-FIL-01 - Nutsche filter-dryer**

| Tag | Parameter | Unit | Today | Rate | Target | LSL | USL |
|---|---|---|---|---|---|---|---|
| .DP | Filter differential pressure | bar | DS3 | 10 s | - | - | 1.5 |
| .FILT_TIME | Filtration duration | min | DS2 | per batch | 90 | - | 150 |
| .DRY_TEMP | Drying temp | degC | DS3 | 30 s | 45 | 40 | 50 |
| .DRY_VAC | Drying vacuum | mbar | DS3 | 30 s | 50 | - | 100 |
| .LOD | Loss on drying (end) | % | DS2 | per batch | - | - | 0.5 |

**L1-DRM-SC01 - Freebase drumming**

| Tag | Parameter | Unit | Today | Target | LSL | USL |
|---|---|---|---|---|---|---|
| .GROSS / .TARE / .NET | Weights | kg | DS2 (typed) | net 25.00 | 24.80 | 25.20 |
| .DRUM_ID / .SRC_BATCH | Drum & source batch | - | DS1 | - | - | - |

**L1-SLT-01 - Acetate salt reactor / L1-SDR-01 dryer**

| Tag | Parameter | Unit | Today | Rate | Target | LSL | USL |
|---|---|---|---|---|---|---|---|
| SLT.T_INT | Reaction temperature | degC | DS3 | 10 s | 45 | 40 | 50 |
| SLT.FB_IN | Freebase charged | kg | DS2 | per run | recipe | -1 % | +1 % |
| SLT.ACID_IN | Acid charged (calc vs actual) | kg | DS2 | per run | recipe | -2 % | +2 % |
| SLT.PH_END | Final pH | pH | DS2 | per run | 5.0 | 4.6 | 5.4 |
| SLT.OUT_KG | Salt output (wet) | kg | DS2 | per run | - | - | - |
| SDR.TEMP | Dryer temperature | degC | DS3 | 30 s | 50 | 45 | 55 |
| SDR.VAC | Dryer vacuum | mbar | DS3 | 30 s | 30 | - | 60 |
| SDR.TIME | Drying time | h | DS2 | per run | 18 | 16 | 24 |

**Quality results L1 (QC-HPLC-01 / external COA)** - DS1/DS2, linked by batch ID:
MIT assay (freebase % w/w, target >= 97.0), MIT acetate assay (>= 98.0), 7-hydroxymitragynine (report, demo limit <= 0.5 % of total alkaloids), speciogynine/paynantheine (report), residual heptane (<= 5,000 ppm, ICH Q3C class 3), LOD (<= 0.5 %), heavy metals (COA), microbial (COA), appearance (operator/QA visual).

### 2.4 Solvent (heptane) mass balance model - L1 [DEMO]

```
Heptane in  = fresh purchase receipts (ERP) + recovered return (SRU.REC_TOTAL)
Heptane out = to LLE (LLE.HEP_IN_L) + to crystallization washes (manual)
Losses      = LLE loss (entrained in aqueous) + SRU loss (condenser vent/slip) + CRY/FIL loss (wet cake, dryer) + unaccounted (tank-level reconciliation gap)
KPI         = total heptane loss (L) / kg MIT freebase produced (lot-level and rolling 30 d)
```
Demo loss split (per lot): LLE 38 %, SRU 27 %, FIL/dryer 21 %, unaccounted 14 %.

---

## 3. LINE L2 - Bulk Cannabinoids

Flow **[OBX]**: Crude / WDC -> 1M WFE deterp -> 2M WFE distillation / FSD -> (A) CBD isolation ISO-A..E **or** (B) derivative reaction RXN-1 / RXN-3 (e.g., Delta-8) -> wash / final purification / drying -> QC / inventory.
Records: FOR-BIP-009 (1M log), FOR-BIP-010 (2M log), FOR-BIP-004 (Isolation log), FOR-BIP-003 (D8 log). SOPs: SOP-BIP-003 (isolation), SOP-BIP-005 (D8), SOP-BIP-004 / SOP-BIP-006 (distillation - governing scope unresolved **[OBX]**).
Business question: *which WFE operating conditions are associated with yield or quality variation?*

### 3.1 Stages & equipment

| # | Stage [OBX] | Equipment ID | Equipment | OEE asset? | Record |
|---|---|---|---|---|---|
| 1 | Crude / WDC receipt | L2-RCV-SC01, L2-FDT-01 | Receiving scale; heated feed tank [DEMO] | No | Acumatica + BPR |
| 2 | 1M WFE deterp | **L2-WFE-1M** (+ L2-VP-1M vacuum pump, L2-CHL-1M chiller) | Wiped-film evaporator, pass 1 (strip light terpenes / volatiles) | **Yes** | FOR-BIP-009 |
| 3 | 2M WFE distillation / FSD | **L2-WFE-2M** (+ L2-VP-2M vacuum pump set, L2-CHL-2M chiller) | Wiped-film / short-path, pass 2 (cannabinoid fraction) | **Yes** (L2 constraint) | FOR-BIP-010 |
| 4a | CBD isolation | **L2-ISO-A, -B, -C, -D, -E** | Jacketed crystallization reactors, up to 4 crashes per batch **[OBX]** | **Yes** (each) | FOR-BIP-004 |
| 4b | Derivative reaction | **L2-RXN-1, L2-RXN-3** | Jacketed reactors with heater/TCU | **Yes** (each) | FOR-BIP-003 |
| 5 | Filtration / wash | L2-BUF-01 | Buchner vacuum filtration station (rinses) | **Yes** | FOR-BIP-004 (rinses) |
| 5 | Drying | L2-VO-01, L2-VO-02 | Vacuum drying ovens (trays) | **Yes** | FOR-BIP-004 (tray timing) |
| 6 | QC / inventory | QC-HPLC-01 | In-house lab, COAs, Acumatica | No | COA |

Note: RXN-2 is not referenced by OBX; do not add it. D8 crude after washes is assumed to return to WFE-2M for final distillation (**[DEMO] - validate route**).

**L2 constraint asset [DEMO]:** L2-WFE-2M.

### 3.2 Volumes & rates [DEMO]

| Item | Value |
|---|---|
| WFE-1M rated feed | 6.0 kg/h (ideal); typical 4.6 - 5.6 |
| WFE-2M rated feed | 4.0 kg/h (ideal); typical 3.0 - 3.8 |
| 2M campaign | 120 - 200 kg crude-equivalent per campaign, 36 - 60 h |
| Distillate yield 2M | 68 - 80 % of 1M residue mass; potency 85 - 92 % total cannabinoids |
| ISO reactor working volume | 100 L each (A-E) |
| ISO charge | 30 - 40 kg distillate + heptane (recipe ratio from SOP-BIP-003) |
| ISO ideal cycle (crash 1) | 30 h: charge 1 h, dissolve 2 h, controlled cool 6 h, crash to <= -18 degC 7 h, hold 10 h, filter/rinse 3 h, clean 1 h |
| Crashes | Crash 1 on fresh charge; crashes 2-4 on mother liquor, each smaller |
| Isolate yield (crash 1) | 55 - 68 % of CBD in charge; purity >= 99.0 % |
| RXN charge | 18 - 26 kg CBD isolate |
| RXN ideal cycle | 9 h: charge/dissolve 1 h, heat to 50-55 degC 1 h, acid-in + exotherm 0.5 h, cook 85-95 degC 3 h, 3 washes 3 h, drain 0.5 h |
| Vacuum oven | 24 h drying, 6 - 12 trays |

### 3.3 Process parameters (L2)

**L2-WFE-1M and L2-WFE-2M** - FOR-BIP-009/010 capture *set and actual* for each, every 2 h **[OBX]**. Demo streams them continuously.

| Tag | Parameter (form label) | Unit | Today | Rate | 1M target (LSL-USL) | 2M target (LSL-USL) | Used in |
|---|---|---|---|---|---|---|---|
| .WIPER_SP/.WIPER_PV | Wiper speed (VFD) | rpm | DSP / DS3 | 5 s | 300 (280-320) | 300 (280-320) | SPC, state |
| .FEED_SP/.FEED_PV | Feed rate (pump VFD) | kg/h | DSP / DS3 | 5 s | 5.0 (4.0-6.0) | 3.5 (3.0-4.0) | OEE perf, SPC |
| .FEED_T | Feed temperature | degC | DSP / DS3 | 10 s | 90 (85-95) | 100 (95-105) | SPC |
| .EVAP_SP/.EVAP_PV | Evaporator (jacket) temp | degC | DSP / DS3 | 10 s | 150 (145-155) | 175 (170-180) | SPC, golden window |
| .COND_SP/.COND_PV | Condenser temp | degC | DSP / DS3 | 10 s | 50 (45-55) | 70 (65-75) | SPC |
| .VAC_PV | Vacuum | mbar | DSP / DS3 | 5 s | 0.8 (USL 1.5) | 0.020 (USL 0.050) | SPC, state, deviation |
| .CHL_SP/.CHL_PV | Chiller / cold trap | degC | DSP / DS3 | 30 s | -10 (-15 to -5) | -15 (-20 to -10) | SPC |
| .TARGET | Target (recipe setpoint) | degC | DSP | per run | recipe | recipe | Recipe context |
| .RUNOFF_RATE | Run-off (residue) rate | kg/h | DSP | 1 min | calc | calc | Yield |
| .DIST_RATE | Distillate rate | kg/h | DSP | 1 min | calc | calc | Yield |
| .MASS_IN / .MASS_DIST / .MASS_RES | Batch masses | kg | DSP -> Scale | per batch | - | - | Yield, OEE qty |
| .OIL_ADDED | Oil-added confirmation (2M) | attest | DSP | event | - | - | Logbook |
| .POTENCY | Distillate total cannabinoids (HPLC) | % | DS2 | per batch | - | >= 85.0 | Quality |
| .THC_D9 | Delta-9 THC in distillate | % w/w | DS2 | per batch | - | <= 0.3 (hemp compliance context) | Quality |

State logic: Running = wiper ON and feed > 0.5 kg/h and vacuum within USL. Micro-stop = feed interruption < 5 min. Downtime = feed 0 or vacuum > USL for >= 5 min while scheduled.

**L2-ISO-A..E - CBD isolation** (FOR-BIP-004 Rev 7 / SOP-BIP-003)

| Tag | Parameter | Unit | Today | Rate | Target | LSL | USL | Used in |
|---|---|---|---|---|---|---|---|---|
| .T_INT | Internal product temp | degC | DS3 (display) | 10 s | profile | - | - | **Golden tunnel** |
| .T_JKT | Jacket temp | degC | DS3 | 10 s | profile | - | - | GT |
| .CRASH_END_T | Crash endpoint internal temp | degC | DSP | per crash | <= -18 **[OBX]** | - | -18 | SPC (Ppk), deviation |
| .DISSOLVE_T | Dissolution temp | degC | DSP | per batch | 55 | 50 | 60 | SPC |
| .COOL_RATE | Controlled cooling rate | degC/h | calc | 1 min | 5.0 | 3.0 | 7.0 | GT |
| .AGIT | Agitator | rpm | DS3 | 10 s | 80 | 60 | 120 | SPC |
| .INPUT_KG | Input mass | kg | DSP -> Scale | per batch | 35 | 30 | 40 | Yield |
| .HEPTANE_L | Heptane charge | L | DSP | per batch | recipe x input | -3 % | +3 % | Deviation |
| .HOLD_H | Hold at endpoint | h | DSP | per crash | 10 | 8 | 14 | SPC |
| .RINSE_n | Rinse 1-3 volume & time | L / time | DSP | event | recipe | - | - | Logbook |
| .FLUFF_MIX | Fluff / mix done | attest | DSP | event | - | - | - | Logbook |
| .TRAY_IN/.TRAY_OUT | Tray timing | time | DSP | event | 24 h | 20 h | 30 h | Logbook |
| .YIELD_KG | Isolate out | kg | DSP -> Scale | per crash | - | - | - | Yield |
| .PURITY | CBD isolate purity (HPLC) | % | DS2 | per lot | >= 99.0 | 99.0 | - | Quality |
| .VISUAL | Colour / dryness / material condition | attest | DSP | event | "white, free-flowing" | - | - | Operator judgement (stays manual) |

**L2-RXN-1 / L2-RXN-3 - Derivative (Delta-8) reaction** (FOR-BIP-003 Rev 4 / SOP-BIP-005)

| Tag | Parameter | Unit | Today | Rate | Target | LSL | USL | Used in |
|---|---|---|---|---|---|---|---|---|
| .T_INT | Reaction temperature | degC | DS3 | **1 s** (exotherm) | profile | - | - | **Golden tunnel** |
| .HEATER_SP | Heater / TCU setpoint | degC | DS3 | event | recipe | - | - | GT context |
| .PRE_ACID_T | Temp at acid-in | degC | DSP | event | 52.5 | 50 **[OBX]** | 55 **[OBX]** | SPC, deviation |
| .EXO_PEAK_T | Exotherm peak temp | degC | DSP | per batch | derived | - | demo 78 | SPC (Ppk) |
| .EXO_RISE | Exotherm rise (peak - acid-in) | degC | derived | per batch | demo 18 | - | demo 25 | SPC |
| .EXO_TTP | Time to peak | min | derived | per batch | demo 9 | 5 | 15 | SPC |
| .COOK_T | Post-exotherm cook temp | degC | DSP | 10 s | 90 | 85 **[OBX]** | 95 **[OBX]** | SPC, compliance % |
| .COOK_TIME | Cook duration in band | h | derived | per batch | recipe | - | - | Compliance |
| .INPUT_KG | Input mass (drives recipe calc) | kg | DSP -> Scale | per batch | - | 18 | 26 | Recipe |
| .ACID_CALC / .ACID_ACT | Acid (PTSA) calculated vs actual | kg | DSP | event | recipe (SOP-BIP-005, OBX-supplied factor) | -2 % | +2 % | Deviation |
| .HEPTANE_CALC / .HEPTANE_ACT | Heptane calc vs actual | L | DSP | event | recipe | -3 % | +3 % | Deviation |
| .MAT_IN_TIME / .ACID_IN_TIME | Material-in / acid-in times | time | DSP | event | - | - | - | Logbook |
| .WASH_1..3 | Wash checks (1-3) | attest + pH | DSP | event | 3 washes done | - | - | Logbook |
| .WASH3_PH | Final wash aqueous pH | pH | DSP | event | 7.0 | 6.5 | 8.0 | SPC |
| .AGIT | Agitator | rpm | DS3 | 10 s | 120 | 100 | 150 | SPC |
| .CONV | Conversion (HPLC: residual CBD) | % | DS2 | per batch | - | - | demo <= 1.0 | Quality |
| .D9 | Delta-9 THC in product | % w/w | DS2 | per batch | - | - | demo <= 0.3 | Quality |

Demo recipe factors are placeholders labelled "Recipe factor - OBX-supplied"; the demo does not publish OBX chemistry.

**L2-BUF-01 Buchner / L2-VO-01..02 Vacuum ovens**

| Tag | Parameter | Unit | Today | Target | LSL | USL |
|---|---|---|---|---|---|---|
| BUF.VAC | Filtration vacuum | inHg | DS3 | -25 | - | -20 |
| BUF.FILT_MIN | Filtration duration | min | DSP | 45 | - | 90 |
| BUF.RINSE_EVT | Rinse events | count | DSP | 3 | 3 | 3 |
| VO.TEMP | Oven temperature | degC | DS3 | 45 | 40 | 50 |
| VO.VAC | Oven vacuum | inHg | DS3 | -28 | - | -25 |
| VO.TIME | Drying time | h | DSP | 24 | 20 | 30 |
| VO.RES_SOLV | Residual heptane (HPLC/GC) | ppm | DS2 | - | - | 5,000 |

---

## 4. OEE model per asset type (summary - full rules in `04`)

| Asset type | Availability | Performance | Quality | Count unit |
|---|---|---|---|---|
| WFE-1M / WFE-2M (continuous) | Run time / Planned time | Mass fed (kg) / (Rated kg/h x Run time) | In-spec distillate kg / Total distillate kg | kg |
| ISO-A..E, RXN-1/3, CRY-01/02, SLT-01 (batch) | Run time / Planned time | (Ideal cycle x batches completed) / Run time | Batches first-pass released / batches completed (mass-weighted) | batch + kg |
| EXT-T01..T04 (cyclic) | Run time / Planned time | (Ideal 8 h x cycles) / Run time | Cycles with drain liquor in spec / cycles | cycle + kg biomass |
| LLE-01, SRU-01 (continuous) | Run time / Planned time | Actual L/h / Rated L/h | In-spec organic (or recovered heptane purity >= 98 %) / total | L |
| FIL-01, SDR-01, VO-01/02, BUF-01 | Run time / Planned time | Ideal duration / actual duration | Loads passing LOD / residual solvent | load |

Yield (separate KPI, always shown beside OEE): output mass of target compound / theoretical input mass of that compound.

Demo OEE bands: L1 line 52 - 64 %, L2 line 48 - 62 %; best asset ~72 %, worst ~38 %. Batch chemical benchmark 45 - 65 %; do not show "world-class 85 %".

---

## 5. Machine states (both lines)

| State | Code | Colour | Planned? | Trigger |
|---|---|---|---|---|
| Production / Running | RUN | green | - | Asset running a scheduled batch/phase |
| Micro-stop | MICRO | red tick | Unplanned | Stop < threshold (WFE only, 5 min) |
| Downtime (unplanned) | DOWN | red | Unplanned | Stop >= threshold, or process interlock |
| Planned stop | PLAN | purple | Planned | Changeover, cleaning, PM, CIP, solvent swap |
| Idle / Waiting | IDLE | amber | Unplanned* | Ready but no material / no operator / waiting QA |
| QA Hold | HOLD | blue-grey | Unplanned | Batch held pending lab result |
| No schedule | NOSCH | light grey hatched | Excluded | Outside planned production |
| Disconnected | DISC | grey | Excluded (data) | No data from edge > 2 min (outdoor pad network loss) |

*Idle counts as availability loss if inside planned time.

---

## 6. Downtime reason tree (both lines)

Format: `Category > Sub-category > Reason [code] (lines)`. Category drives colour and Pareto grouping.

**P - Planned (excluded from availability loss if within plan)**
- P1 Changeover > Product / recipe change [P101] (L2) ; Solvent swap [P102] (L1, L2)
- P2 Cleaning > Reactor clean-out between batches [P201] (L1, L2) ; WFE clean / hot flush [P202] (L2) ; Filter cloth change [P203] (L1, L2)
- P3 Planned maintenance > Scheduled PM [P301] ; Vacuum pump oil change [P302] (L2) ; Wiper blade replacement [P303] (L2) ; Calibration (pH / TT / scale) [P304]
- P4 Shift handover [P401] ; P5 Safety meeting / training [P501]

**E - Equipment failure (unplanned)**
- E1 Vacuum system > Vacuum pump trip [E101] (L2, L1-FIL) ; Pump oil degraded [E102] ; Vacuum leak (seal / O-ring) [E103] ; Cold-trap iced / blocked [E104]
- E2 Rotating > Wiper motor / VFD fault [E201] (L2 WFE) ; Feed pump failure [E202] ; Agitator fault [E203] ; Recirculation pump failure [E204] (L1 EXT)
- E3 Thermal > Heater / TCU fault [E301] ; Chiller fault / high return temp [E302] ; Jacket fluid leak [E303]
- E4 Instrumentation > pH probe drift / failure [E401] (L1 CRY, LLE) ; Temperature sensor fault [E402] ; Scale fault [E403] ; Level transmitter fault [E404]
- E5 Controls > PLC / HMI fault [E501] (L1 EXT) ; Valve failure (stuck / leaking) [E502] ; Dosing pump fault [E503] (L1 CRY)

**R - Process (unplanned)**
- R1 Vacuum loss - process (outgassing / residual solvent in feed) [R101] (L2)
- R2 Temperature excursion > Product temp out of band [R201] ; Cooling too slow [R202] (ISO, CRY) ; Exotherm over-run [R203] (RXN)
- R3 Feed / flow > Feed line solidified / blocked [R301] (L2 WFE) ; Low recirculation flow [R302] (L1 EXT)
- R4 Separation > Emulsion / rag layer [R401] (L1 LLE) ; Slow phase separation [R402] (L1 LLE, RXN washes)
- R5 Filtration > Slow filtration / blinded cloth [R501] (L1 FIL, L2 BUF) ; Wet cake / re-filter [R502]
- R6 pH control > pH overshoot [R601] (L1 CRY) ; pH not reaching endpoint [R602]
- R7 Foaming / carry-over [R701] (L2 WFE, L1 SRU)

**M - Material & logistics (unplanned)**
- M1 Waiting for feed material > Biomass lot not released [M101] (L1) ; Crude / distillate not available [M102] (L2) ; Tote not available [M103] (L1)
- M2 Waiting for solvent > Heptane low - fresh [M201] ; Recovered heptane off-spec [M202]
- M3 Waiting for consumables (base, acid, filter media, drums) [M301]
- M4 Material out of spec (input) [M401]

**U - Utilities (unplanned)**
- U1 Power outage / dip [U101] ; U2 Nitrogen / compressed air low [U201] ; U3 Cooling water / chilled glycol loss [U301] ; U4 Thermal fluid / steam loss [U401]

**Q - Quality (unplanned)**
- Q1 Awaiting in-process lab result [Q101] ; Q2 Deviation investigation hold [Q201] ; Q3 Awaiting QA release to proceed [Q301]

**H - People (unplanned)**
- H1 Operator not available [H101] ; H2 Awaiting supervisor sign-off [H201] ; H3 Training on job [H301]

**X - External (unplanned)**
- X1 Weather hold - lightning / storm (outdoor pad) [X101] (L1 EXT) ; X2 Freeze protection [X102] (L1 EXT) ; X3 Network / edge loss [X201] (maps to DISC) ; X4 Regulatory / inspection [X301]

**UNK - Unassigned** [U000] - default for auto-detected stops until an operator tags (target: < 5 % of downtime minutes untagged after shift end).

Demo Pareto shape (30 days, as generated with seed 2609 - see `seed-data/sample/downtime_pareto_30d.json`): L2 (~1,240 non-productive h across 12 assets) - E1xx vacuum family 14.6 % (plus R1 vacuum-process codes -> ~18 %), E3xx jacket/thermal 13.1 %, R2xx crystallization process 10.1 %, M102 crude not available 8.8 %, Q101 lab wait 7.9 %. L1 (~1,210 h) - M1xx material/tote/lot release 13 %, X101 weather 10.8 %, E4xx pH/instrument 9.7 %, E5xx scale/filter 8.2 %, U301 glycol loss 6.2 %. Pareto UI must offer 'group by failure mode (first 2-3 chars)' as well as 'by code'.

---

## 7. Quality loss / rejection reason tree

Dispositions: **HOLD** (pending), **REWORK** (re-process, mass recoverable), **DOWNGRADE** (sold/used at lower grade), **SCRAP** (destroyed / hazardous waste). Unit: kg (and batch).

**L1 Kratom / MIT**
| Code | Stage | Reason | Typical disposition |
|---|---|---|---|
| QL1-01 | Biomass | Biomass MIT content below spec (COA) | Downgrade / supplier claim |
| QL1-02 | Biomass | Foreign matter / moisture high | Hold |
| QL1-03 | Extraction | Extract liquor pH out of range | Rework (re-adjust) |
| QL1-04 | LLE | Emulsion carry-over / aqueous in organic | Rework (re-settle) |
| QL1-05 | Crystallization | Freebase assay < 97.0 % | Rework (re-crystallize) |
| QL1-06 | Crystallization | 7-OH-mitragynine above demo limit | Hold -> QA decision |
| QL1-07 | Crystallization | Off-colour / dark crystals | Rework |
| QL1-08 | Filter/dryer | LOD > 0.5 % | Rework (re-dry) |
| QL1-09 | Filter/dryer | Residual heptane > 5,000 ppm | Rework (re-dry) |
| QL1-10 | Drumming | Drum net weight out of tolerance | Rework (re-weigh) |
| QL1-11 | Drumming | Genealogy mismatch (drum-batch link) | Hold |
| QL1-12 | Salt | Salt assay < 98.0 % | Rework |
| QL1-13 | Salt | Final pH out of range | Rework |
| QL1-14 | Salt | Micro / heavy metals fail (external COA) | Scrap |

**L2 Bulk Cannabinoids**
| Code | Stage | Reason | Typical disposition |
|---|---|---|---|
| QL2-01 | Crude | Crude potency below spec | Downgrade |
| QL2-02 | 1M WFE | Residual terpenes / volatiles high in residue | Rework (re-pass 1M) |
| QL2-03 | 2M WFE | Distillate potency < 85 % | Rework (re-distil) |
| QL2-04 | 2M WFE | Distillate dark / colour off-spec | Rework / Downgrade |
| QL2-05 | 2M WFE | Delta-9 THC above limit | Hold -> remediation |
| QL2-06 | ISO | Isolate purity < 99.0 % | Rework (re-crystallize) |
| QL2-07 | ISO | Yellow / off-white isolate (visual) | Rework (rinse / re-crystallize) |
| QL2-08 | ISO | Crash endpoint not reached (> -18 degC) - low yield | Rework (re-crash) |
| QL2-09 | RXN | Incomplete conversion (residual CBD high) | Rework (re-cook per SOP) |
| QL2-10 | RXN | Delta-9 THC / side-product above limit | Hold -> QA |
| QL2-11 | RXN | Wash pH out of range | Rework (extra wash) |
| QL2-12 | Drying | Residual heptane > 5,000 ppm | Rework (re-dry) |
| QL2-13 | Drying | LOD / moisture high | Rework |
| QL2-14 | Any | Contamination / foreign matter | Scrap |
| QL2-15 | Any | Spill / handling loss | Scrap (mass loss) |

---

## 8. Batch phases (ISA-88) for timeline lanes and golden tunnel alignment

| Asset | Phases (in order) |
|---|---|
| L1-EXT-Txx | FILL -> SOAK -> RECIRC -> DRAIN -> IDLE |
| L1-LLE-01 | STARTUP -> CONTACT (continuous contact / settle / decant) -> FLUSH |
| L1-CRY-0x | CHARGE -> DOSE (pH ramp) -> COOL -> HOLD -> DISCHARGE -> CLEAN |
| L1-FIL-01 | LOAD -> FILTER -> WASH -> DRY -> UNLOAD |
| L1-SLT-01 | CHARGE -> DISSOLVE -> ACID ADD -> REACT -> CRYSTALLIZE -> DISCHARGE |
| L2-WFE-1M/2M | WARM-UP -> VAC PULL-DOWN -> STEADY FEED -> SHUTDOWN -> CLEAN |
| L2-ISO-x | CHARGE -> DISSOLVE -> CONTROLLED COOL -> CRASH -> HOLD -> TRANSFER/FILTER -> RINSE -> CLEAN (repeat CRASH..RINSE for crash 2-4) |
| L2-RXN-x | CHARGE -> HEAT (pre-acid 50-55) -> ACID IN -> EXOTHERM -> COOK (85-95) -> WASH 1 -> WASH 2 -> WASH 3 -> DRAIN |
| L2-VO-0x | LOAD -> DRY -> UNLOAD |

---

## 9. Assumptions register (show in demo Settings > "About this demo")

1. Equipment IDs, tank counts, reactor volumes, rates and all LSL/USL marked [DEMO] are illustrative.
2. Only limits stated by OBX are real: ISO crash endpoint <= -18 degC; D8 pre-acid 50-55 degC; D8 cook 85-95 degC; three washes; 1M/2M 2-hour checks; lot size 14-17 t.
3. Distillation limits must not be treated as governed until OBX Quality resolves SOP-BIP-004 vs SOP-BIP-006.
4. Recipe factors (PTSA, heptane, base) are placeholders; OBX supplies real values.
5. Shift pattern (2 x 12 h) is assumed.
6. New meters (LLE flows, SRU totaliser) are shown as "proposed instrumentation" (DS4 -> Connected).
