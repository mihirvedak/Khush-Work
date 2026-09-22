import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Lock, AlertTriangle, Check } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { formByNo } from '../../data/index';
import { Drawer, Section, AuditTrail } from '../../components/Drawer';
import { SourceBadge, DemoLimitTag, ObxLimitTag } from '../../components/primitives';
import { SignatureDialog, type SignMeaning } from '../../components/Signature';
import { StatusChip } from '../Logbooks';
import { fmtTs, fmtTsMin } from '../../lib/time';
import { unitLabel } from '../../lib/format';
import type { LogbookEntry } from '../../data/types';
import type { FormField } from '../../data/forms';

type Row = LogbookEntry & { uiStatus: LogbookEntry['status'] };

/** Capture kind -> the badge shown next to the value (ref 06.2 / UI-10). */
const CAPTURE_LABEL: Record<string, string> = {
  live: 'Auto - controller',
  milestone: 'Auto - milestone',
  calc: 'Calculated',
  scale: 'Auto - scale',
  lims: 'LIMS / COA',
  erp: 'ERP',
  genealogy: 'Genealogy',
  manual: 'Operator entry',
  system: 'System',
};

export function FormEntryDrawer({ entry, onClose }: { entry: Row; onClose: () => void }) {
  const { role, user, overlay, sign, setFormValue } = useStore();
  const form = formByNo(entry.formNo);
  const [signOpen, setSignOpen] = useState<SignMeaning | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  const sigs = overlay.signatures[entry.id] ?? [];
  const status = entry.uiStatus;
  const locked = status === 'Approved';

  const outOfLimit = entry.fields.filter((f) => f.outOfLimit);
  const missingComment = outOfLimit.filter((f) => !comments[f.key]?.trim());

  // which signature step is this role allowed to apply next?
  const nextStep = useMemo((): { step: SignMeaning; role: string } | null => {
    if (locked) return null;
    if (status === 'Due' || status === 'Overdue' || status === 'Returned') return { step: 'Performed', role: 'Operator' };
    if (status === 'Submitted') return { step: 'Reviewed', role: 'Shift Supervisor' };
    if (status === 'Reviewed') return { step: 'Approved', role: 'QA' };
    return null;
  }, [status, locked]);

  const canSign = nextStep
    ? (nextStep.step === 'Performed' && (role === 'Operator' || role === 'Shift Supervisor'))
      || (nextStep.step === 'Reviewed' && (role === 'Shift Supervisor' || role === 'Production Manager'))
      || (nextStep.step === 'Approved' && role === 'QA')
    : false;

  const blocked = nextStep?.step === 'Performed' && missingComment.length > 0;

  // group fields by their section so repeating blocks read like the paper form
  const grouped = useMemo(() => {
    const acc = new Map<string, { row?: number; fields: typeof entry.fields }[]>();
    for (const f of entry.fields) {
      const sec = f.section ?? 'General';
      if (!acc.has(sec)) acc.set(sec, []);
      const list = acc.get(sec)!;
      const bucket = list.find((b) => b.row === f.row);
      if (bucket) bucket.fields.push(f);
      else list.push({ row: f.row, fields: [f] });
    }
    return [...acc.entries()];
  }, [entry.fields]);

  const schemaField = (key: string): FormField | undefined => {
    for (const s of form?.sections ?? []) {
      const hit = s.fields.find((f) => f.key === key);
      if (hit) return hit;
    }
    return undefined;
  };

  const autoCount = entry.fields.filter((f) => f.source !== 'Manual').length;

  const audit = [
    { at: fmtTs(entry.dueAt), by: 'System', what: `Entry scheduled (${form?.revision ?? ''})` },
    ...(entry.submittedAt ? [{ at: fmtTs(entry.submittedAt), by: entry.operator ?? '-', what: 'Performed (submitted)' }] : []),
    ...(entry.reviewer ? [{ at: fmtTs(entry.submittedAt ?? entry.dueAt), by: entry.reviewer, what: 'Reviewed' }] : []),
    ...(entry.approver ? [{ at: fmtTs(entry.submittedAt ?? entry.dueAt), by: entry.approver, what: 'Approved - record locked' }] : []),
    ...entry.corrections.map((c) => ({
      at: fmtTs(c.at), by: c.by, what: `Corrected ${c.key}`, from: c.old, to: c.new, reason: c.reason,
    })),
    ...sigs.map((s) => ({ at: fmtTs(s.at), by: s.by, what: `${s.step} in demo`, reason: s.meaning })),
  ];

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width={680}
        title={
          <span className="flex items-center gap-2">
            <span className="mono">{entry.formNo}</span>
            <span className="text-sm font-normal text-txt-secondary">{form?.title}</span>
            {locked && <Lock size={13} className="text-ok" aria-label="Locked" />}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{form?.revision} &middot; effective {form?.effective}</span>
            {form?.demo ? <DemoLimitTag /> : <ObxLimitTag />}
            <StatusChip s={status} />
          </span>
        }
        tabs={[
          {
            id: 'form',
            label: 'Form',
            content: (
              <>
                <div className="mb-3 grid grid-cols-2 gap-2 rounded-ctl border border-line bg-subtle px-3 py-2 text-xs">
                  <Field label="Asset" value={entry.assetId} mono />
                  <Field label="Batch" value={entry.batchId ?? '-'} mono />
                  <Field label="Shift" value={entry.shift} />
                  <Field label="Due" value={fmtTsMin(entry.dueAt)} mono />
                  <Field label="Operator" value={entry.operator ?? '-'} />
                  <Field label="Submitted" value={entry.submittedAt ? fmtTsMin(entry.submittedAt) : '-'} mono />
                </div>

                {outOfLimit.length > 0 && (
                  <div className="mb-3 flex items-start gap-2 rounded-ctl bg-danger-bg px-3 py-2 text-xs text-danger">
                    <AlertTriangle size={14} className="mt-px shrink-0" />
                    <div>
                      <b>{outOfLimit.length} value{outOfLimit.length === 1 ? '' : 's'} outside limits.</b>{' '}
                      Each one needs a comment and a linked deviation before this record can be submitted.
                    </div>
                  </div>
                )}

                {grouped.map(([section, buckets]) => (
                  <Section key={section} title={section}>
                    {buckets.map((b, bi) => (
                      <div key={bi} className={clsx(buckets.length > 1 && 'mb-3 rounded-ctl border border-line p-2')}>
                        {buckets.length > 1 && (
                          <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-muted">
                            Row {(b.row ?? 0) + 1}
                          </div>
                        )}
                        <div className="space-y-1">
                          {b.fields.map((f) => {
                            const def = schemaField(f.key);
                            return (
                              <FormRow
                                key={`${f.key}-${f.row ?? 0}`}
                                field={f}
                                def={def}
                                locked={locked}
                                comment={comments[f.key] ?? ''}
                                onComment={(v) => setComments((c) => ({ ...c, [f.key]: v }))}
                                onChange={(v) => setFormValue(entry.id, f.key, v)}
                                override={overlay.formValues[entry.id]?.[f.key]}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </Section>
                ))}

                <p className="mt-2 rounded-ctl bg-azure-50 px-3 py-2 text-2xs text-txt-secondary">
                  <b>{autoCount} of {entry.fields.length} fields auto-populate</b> from equipment, scales, LIMS or genealogy.
                  On paper every one of these is transcribed by hand. Operator judgement &mdash; visual checks, critical
                  additions, attestations &mdash; stays manual by design.
                </p>
              </>
            ),
          },
          {
            id: 'signoff',
            label: 'Sign-off',
            content: (
              <>
                <Section title="Signature chain">
                  <ol className="space-y-2">
                    {(form?.signoff ?? []).map((s) => {
                      const done =
                        (s.step === 'Perform' && entry.submittedAt) ||
                        (s.step === 'Review' && entry.reviewer) ||
                        (s.step === 'Approve' && entry.approver) ||
                        sigs.some((x) => x.step === s.step);
                      const who =
                        s.step === 'Perform' ? entry.operator
                          : s.step === 'Review' ? entry.reviewer
                            : s.step === 'Approve' ? entry.approver
                              : null;
                      const demoSig = sigs.find((x) => x.step === s.step);
                      return (
                        <li key={s.step} className="flex items-start gap-2 rounded-ctl border border-line px-3 py-2">
                          <span className={clsx('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full', done ? 'bg-ok text-white' : 'bg-subtle text-txt-muted')}>
                            {done ? <Check size={10} /> : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-txt-primary">{s.step} &middot; {s.role}</div>
                            <div className="text-2xs text-txt-muted">{s.meaning}</div>
                            {(who || demoSig) && (
                              <div className="mono mt-0.5 text-2xs text-txt-secondary">
                                {demoSig ? `${demoSig.by} · ${fmtTs(demoSig.at)}` : who}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </Section>

                {form?.blockingRules?.length ? (
                  <Section title="Blocking rules">
                    <ul className="list-disc space-y-1 pl-4 text-xs text-txt-secondary">
                      {form.blockingRules.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </Section>
                ) : null}

                {form?.escalation && (
                  <Section title="Escalation">
                    <p className="text-xs text-txt-secondary">{form.escalation}</p>
                  </Section>
                )}

                {form?.governingSop?.length ? (
                  <Section title="Governing documents">
                    <div className="flex flex-wrap gap-1.5">
                      {form.governingSop.map((s) => (
                        <span key={s} className="mono rounded border border-line px-1.5 py-0.5 text-2xs text-txt-secondary">{s}</span>
                      ))}
                    </div>
                  </Section>
                ) : null}
              </>
            ),
          },
          { id: 'audit', label: 'Audit trail', content: <AuditTrail entries={audit} /> },
        ]}
        footer={
          locked ? (
            <p className="flex items-center gap-1.5 text-xs text-ok">
              <Lock size={13} /> Approved and locked &mdash; this record is read-only. Corrections require a new
              entry with reason-for-change.
            </p>
          ) : nextStep ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs text-txt-muted">
                {canSign ? `Signing as ${user}` : `Waiting on ${nextStep.role}`}
                {blocked && ' · comment required on out-of-limit values'}
              </span>
              <button
                type="button"
                disabled={!canSign || blocked}
                onClick={() => setSignOpen(nextStep.step)}
                className="rounded-ctl bg-azure-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Sign as {nextStep.step}
              </button>
            </div>
          ) : undefined
        }
      />

      <SignatureDialog
        open={signOpen !== null}
        onClose={() => setSignOpen(null)}
        meaning={signOpen ?? 'Performed'}
        entity={`${entry.formNo} ${entry.id}`}
        onSign={({ meaning }) => {
          const step = meaning === 'Performed' ? 'Perform' : meaning === 'Reviewed' ? 'Review' : 'Approve';
          sign(entry.id, step, meaning);
        }}
      />
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-2xs text-txt-muted">{label}</div>
      <div className={clsx('text-xs text-txt-primary', mono && 'mono')}>{value}</div>
    </div>
  );
}

/** UI-10 FormRow: label, value, unit, source badge, auto-fill indicator, limit error. */
function FormRow({
  field, def, locked, comment, onComment, onChange, override,
}: {
  field: LogbookEntry['fields'][number];
  def?: FormField;
  locked: boolean;
  comment: string;
  onComment: (v: string) => void;
  onChange: (v: string | number | boolean | null) => void;
  override?: string | number | boolean | null;
}) {
  const auto = field.source !== 'Manual';
  const value = override ?? field.value;
  const display = value === null || value === undefined || value === '' ? '-' : String(value);
  const capture = def?.capture ?? (auto ? 'live' : 'manual');

  return (
    <div className={clsx('rounded px-2 py-1.5', field.outOfLimit && 'bg-danger-bg')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-txt-primary">
            {field.label}
            {def?.required && <span className="ml-0.5 text-danger">*</span>}
          </div>
          {def?.rule && <div className="text-2xs text-txt-muted">{def.rule}</div>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {auto || locked ? (
            <span className={clsx('mono text-xs', field.outOfLimit ? 'font-semibold text-danger' : 'text-txt-primary')}>
              {display}{field.unit ? ` ${unitLabel(field.unit)}` : ''}
            </span>
          ) : (
            <input
              defaultValue={display === '-' ? '' : display}
              onBlur={(e) => onChange(e.target.value)}
              className="w-28 rounded-ctl border border-line bg-surface px-1.5 py-1 text-right text-xs"
              aria-label={field.label}
            />
          )}
          <SourceBadge source={field.source} />
        </div>
      </div>

      <div className="mt-0.5 flex items-center gap-2 text-2xs text-txt-muted">
        <span>{CAPTURE_LABEL[capture] ?? capture}</span>
        {(def?.min !== undefined || def?.max !== undefined) && (
          <span>
            Limit {def.min ?? '-'} to {def.max ?? '-'} {field.unit ? unitLabel(field.unit) : ''}
            {def.limitRef ? ` (${def.limitRef})` : ''}
          </span>
        )}
        {def && !def.limitRef && (def.min !== undefined || def.max !== undefined) && <DemoLimitTag />}
      </div>

      {field.outOfLimit && (
        <div className="mt-1.5">
          <label className="block">
            <span className="text-2xs font-semibold text-danger">Comment required (out of limit)</span>
            <textarea
              value={comment}
              onChange={(e) => onComment(e.target.value)}
              rows={2}
              disabled={locked}
              placeholder="Explain the excursion and link a deviation"
              className="mt-0.5 w-full rounded-ctl border border-danger bg-surface px-2 py-1 text-xs"
            />
          </label>
        </div>
      )}
    </div>
  );
}
