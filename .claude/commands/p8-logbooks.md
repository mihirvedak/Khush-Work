---
description: P8 - Logbooks and Escalation
---

First read .claude/skills/obx-faclon-ops-demo/SKILL.md and obey its hard rules. Work in plan mode first: list the files you will create/change and the acceptance checks, wait for my OK, then implement. Finish with `npm run check` green and a short summary of what to click to verify.

Numbers like 00, 01 ... 09 refer to files in .claude/skills/obx-faclon-ops-demo/references/ (e.g. 03 = 03-downtime-rejection-loggers.md).

Extra instructions from me (may be empty): $ARGUMENTS

Read .claude/skills/obx-faclon-ops-demo/references/06-logbooks-escalation.md (principles, screens, escalation matrix, acceptance) and references/09-form-schema.md (EVERY form, section and field). src/data/forms.ts (FORMS) is the source of truth - the UI must be schema-driven.

Build /logbooks:
1. FormRenderer (schema-driven, one component for all 14 forms): renders FormDef.sections in order; repeating sections (2-hour CHECK rows, CRASH 1..4, WASH 1..3, OIL additions) as a row table on desktop and stacked cards on tablet; sections with appliesTo only for matching assets; fields with appliesTo filtered by asset.
   Field widgets by type: number (unit suffix, decimals), datetime (ET), select/multiselect, boolean, attest (checkbox + "I confirm" + initials), esign (SignatureDialog: user + PIN + meaning), scan (text + scan icon), photo (mock upload), passfail (segmented Pass/Fail), link (deviation picker), longtext, id (read-only chip).
   Capture behaviour: live/milestone/calc/genealogy/scale/lims/erp/system fields are read-only, show SourceBadge + timestamp + info tooltip with `rule`; manual fields editable only by editableBy roles (default Operator). Live fields auto-fill from valueAt(assetId, tag, now) when a NEW entry is started.
   Limits: show target/min/max inline; limitRef shown as "Limit: SOP-BIP-003"; no limitRef => DEMO tag + tooltip "Demo limit - pending OBX Quality". limitRows respected (wash pH only on wash 3). Out-of-limit value turns the field red with icon + text and BLOCKS submit until comment + deviation link (creates a deviation in overlay).
   Corrections: strike-through old value, reason-for-change required, shown inline with who/when. Approved records read-only with lock icon.
2. Logbook home with views: My tasks (by role: due/overdue/returned for Operator, to-review for Supervisor, to-approve for QA), Shift grid (forms x 2-hour slots for the selected shift; cell = status chip with text), Day view, Batch view (formRecord groups every entry of a batch into one record: e.g. FOR-BIP-010 header + all 2-hour rows + oil + close + distillate), Machine view, Line view, Form library (form no, title, revision, effective date, OBX vs demo badge, field count, open the blank form).
3. Review flow: Submitted -> Reviewed (Shift Supervisor) -> Approved (QA) -> Locked, per FormDef.signoff (some forms stop at Review/Verify). Exceptions-only review list (entries with outOfLimit, corrections or late entry). Audit trail tab.
4. Auto-milestones visible live: FOR-BIP-004 REACHED_M18 fills when T_INT <= -18 for 5 consecutive min (ISO-C live batch is still empty - show "Waiting: -19.1 degC trend, est. 42 min"); FOR-BIP-003 recipe calc from input mass and % time in 85-95 degC band.
5. /escalations: matrix view (triggers x L1-L4 with SLA, from 06), live list, SLA widget (ack time p50/p90, % met by level and shift). The missed LOG-EQ-DAILY vacuum-pump-oil checks on WFE-2M shift B must be visible and link to the WFE-2M E102 downtime; LOG-CAL L1-CRY-02.PH as-found FAIL links to CRY-02 final-pH deviations.
Accelerated clock (x60) lets a 2-hour FOR-BIP-010 check come due during the live demo.
Tests: FormRenderer renders every FORMS entry without throwing; submit blocked when an out-of-limit field has no comment; a repeat section renders the right number of rows for a sample record.
