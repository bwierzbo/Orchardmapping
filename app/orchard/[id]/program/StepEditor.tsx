'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { PHENOLOGY_STAGES } from '@/lib/phenology';
import { triggerSchema, describeTrigger } from '@/lib/trigger-schema';

type TriggerKind = 'calendar' | 'phenology' | 'degree_day' | 'threshold' | 'condition';

const KIND_LABEL: Record<TriggerKind, string> = {
  calendar: 'Dates in the year',
  phenology: 'A growth stage',
  degree_day: 'Accumulated heat',
  threshold: 'Trap catches',
  condition: 'A weather condition',
};

const KIND_HELP: Record<TriggerKind, string> = {
  calendar: 'A window of the calendar. Tied to your latitude, so it travels badly.',
  phenology: 'Anchored to a stage you observed. The most portable kind — a stage happens when it happens.',
  degree_day: 'Heat accumulated above a base temperature. Counted from January 1, or from a trap’s first catch.',
  threshold: 'Act when a trap reaches a count. One means act on the first catch.',
  condition: 'A standing watch on the weather rather than a date.',
};

/**
 * Change a step, or write one of your own.
 *
 * The five trigger kinds are the ones the resolver can date, and the
 * schema is shared with the server so a step that saves is a step that
 * will actually appear on the calendar. A form that let you describe
 * something unschedulable would be worse than no form.
 */
export default function StepEditor({
  orchardId,
  step,
  onDone,
}: {
  orchardId: string;
  /** Omit to write a new step. */
  step?: {
    key: string;
    title: string;
    detail: string | null;
    triggerSpec: unknown;
    repeatDays: number | null;
    customised: boolean;
    sourceStepKey: string | null;
  };
  onDone: () => void;
}) {
  const router = useRouter();
  const existing = step?.triggerSpec as Record<string, unknown> | undefined;
  const [title, setTitle] = useState(step?.title ?? '');
  const [detail, setDetail] = useState(step?.detail ?? '');
  const [kind, setKind] = useState<TriggerKind>(
    (existing?.type as TriggerKind) ?? 'phenology'
  );
  const [spec, setSpec] = useState<Record<string, string>>(() => {
    const src = existing ?? {};
    return Object.fromEntries(
      Object.entries(src)
        .filter(([k]) => k !== 'type')
        .map(([k, v]) => [k, String(v)])
    );
  });
  const [repeatDays, setRepeatDays] = useState(step?.repeatDays?.toString() ?? '');
  const [busy, setBusy] = useState(false);

  const field = (k: string) => spec[k] ?? '';
  const set = (k: string, v: string) => setSpec((p) => ({ ...p, [k]: v }));

  /** Build the trigger from the form, dropping blanks so optionals stay optional. */
  function buildTrigger(): unknown {
    const num = (v: string) => (v === '' ? undefined : Number(v));
    switch (kind) {
      case 'calendar':
        return { type: 'calendar', start: field('start'), end: field('end') };
      case 'phenology':
        return {
          type: 'phenology',
          stage: field('stage') || 'green_tip',
          offsetDays: num(field('offsetDays')),
          untilStage: field('untilStage') || undefined,
          windowDays: num(field('windowDays')),
        };
      case 'degree_day':
        return {
          type: 'degree_day',
          dd: num(field('dd')) ?? 0,
          base: num(field('base')),
          cutoff: num(field('cutoff')),
          from: (field('from') || 'jan1') as 'jan1' | 'biofix',
          biofixTrap: field('biofixTrap') || undefined,
          windowDays: num(field('windowDays')),
        };
      case 'threshold':
        return {
          type: 'threshold',
          trap: field('trap'),
          count: num(field('count')) ?? 1,
          staleAfterDays: num(field('staleAfterDays')),
        };
      case 'condition':
        return {
          type: 'condition',
          kind: field('kind') || 'scab_infection',
          fromStage: field('fromStage') || undefined,
          untilStage: field('untilStage') || undefined,
        };
    }
  }

  async function save() {
    const trigger = buildTrigger();
    const parsed = triggerSchema.safeParse(trigger);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (!title.trim()) {
      toast.error('Give the step a name.');
      return;
    }

    setBusy(true);
    try {
      if (step) {
        await trpc.program2.updateStep.mutate({
          orchardId,
          key: step.key,
          patch: {
            title: title.trim(),
            detail: detail.trim() || null,
            triggerSpec: parsed.data,
            repeatDays: repeatDays === '' ? null : Number(repeatDays),
          },
        });
        toast.success(
          step.sourceStepKey
            ? `Saved. "${title.trim()}" now differs from what your region recommends.`
            : 'Saved.'
        );
      } else {
        await trpc.program2.createStep.mutate({
          orchardId,
          title: title.trim(),
          detail: detail.trim() || undefined,
          triggerSpec: parsed.data,
          repeatDays: repeatDays === '' ? undefined : Number(repeatDays),
        });
        toast.success(`Added "${title.trim()}" to this orchard's program.`);
      }
      onDone();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the step');
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full px-2 py-1.5 text-sm rounded-md border border-line bg-surface text-ink';
  const preview = (() => {
    const p = triggerSchema.safeParse(buildTrigger());
    return p.success ? describeTrigger(p.data) : null;
  })();

  return (
    <div className="rounded-lg border border-canopy-600/40 bg-canopy-50/40 dark:bg-canopy-600/5 p-3 space-y-3">
      <div className="space-y-1">
        <label className="text-xs text-bark" htmlFor="step-title">Name</label>
        <input
          id="step-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={input}
          placeholder="Check the deer fence"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-bark" htmlFor="step-detail">What to do</label>
        <textarea
          id="step-detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={2}
          className={input}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-bark" htmlFor="step-kind">Triggered by</label>
        <select
          id="step-kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as TriggerKind);
            setSpec({});
          }}
          className={input}
        >
          {(Object.keys(KIND_LABEL) as TriggerKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <p className="text-xs text-bark">{KIND_HELP[kind]}</p>
      </div>

      {kind === 'calendar' && (
        <div className="grid grid-cols-2 gap-2">
          <Labelled label="From (MM-DD)">
            <input value={field('start')} onChange={(e) => set('start', e.target.value)} placeholder="10-01" className={input} />
          </Labelled>
          <Labelled label="To (MM-DD)">
            <input value={field('end')} onChange={(e) => set('end', e.target.value)} placeholder="03-31" className={input} />
          </Labelled>
        </div>
      )}

      {kind === 'phenology' && (
        <div className="grid grid-cols-2 gap-2">
          <Labelled label="Stage">
            <select value={field('stage')} onChange={(e) => set('stage', e.target.value)} className={input}>
              {PHENOLOGY_STAGES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Days after (optional)">
            <input value={field('offsetDays')} onChange={(e) => set('offsetDays', e.target.value)} className={input} inputMode="numeric" />
          </Labelled>
          <Labelled label="Until stage (optional)">
            <select value={field('untilStage')} onChange={(e) => set('untilStage', e.target.value)} className={input}>
              <option value="">—</option>
              {PHENOLOGY_STAGES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Labelled>
          <Labelled label="or window in days">
            <input value={field('windowDays')} onChange={(e) => set('windowDays', e.target.value)} className={input} inputMode="numeric" />
          </Labelled>
        </div>
      )}

      {kind === 'degree_day' && (
        <div className="grid grid-cols-2 gap-2">
          <Labelled label="Degree-days">
            <input value={field('dd')} onChange={(e) => set('dd', e.target.value)} className={input} inputMode="numeric" />
          </Labelled>
          <Labelled label="Base °F">
            <input value={field('base')} onChange={(e) => set('base', e.target.value)} placeholder="50" className={input} inputMode="numeric" />
          </Labelled>
          <Labelled label="Counted from">
            <select value={field('from') || 'jan1'} onChange={(e) => set('from', e.target.value)} className={input}>
              <option value="jan1">January 1 (no biofix)</option>
              <option value="biofix">A trap&apos;s first catch</option>
            </select>
          </Labelled>
          <Labelled label="Biofix trap">
            <input value={field('biofixTrap')} onChange={(e) => set('biofixTrap', e.target.value)} placeholder="leafroller_pheromone" className={input} />
          </Labelled>
        </div>
      )}

      {kind === 'threshold' && (
        <div className="grid grid-cols-2 gap-2">
          <Labelled label="Trap">
            <input value={field('trap')} onChange={(e) => set('trap', e.target.value)} placeholder="red_sphere" className={input} />
          </Labelled>
          <Labelled label="Catches">
            <input value={field('count')} onChange={(e) => set('count', e.target.value)} placeholder="1" className={input} inputMode="numeric" />
          </Labelled>
        </div>
      )}

      {kind === 'condition' && (
        <Labelled label="Condition">
          <select value={field('kind') || 'scab_infection'} onChange={(e) => set('kind', e.target.value)} className={input}>
            <option value="scab_infection">A scab infection period</option>
            <option value="dry_spell">A dry spell</option>
          </select>
        </Labelled>
      )}

      <Labelled label="Repeat every N days (optional)">
        <input value={repeatDays} onChange={(e) => setRepeatDays(e.target.value)} className={input} inputMode="numeric" />
      </Labelled>

      <p className="text-xs text-bark">
        {preview ? (
          <>
            Will run: <span className="text-ink">{preview}</span>
          </>
        ) : (
          'Not schedulable yet — fill in the fields above.'
        )}
      </p>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy || !preview}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-canopy-600 text-white hover:bg-canopy-700 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : step ? 'Save' : 'Add step'}
        </button>
        <button onClick={onDone} className="px-3 py-1.5 rounded-md text-sm text-bark hover:bg-canopy-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-bark">{label}</span>
      {children}
    </div>
  );
}

/** Edit and delete controls for one step, opening the editor in place. */
export function StepControls({
  orchardId,
  step,
}: {
  orchardId: string;
  step: {
    key: string;
    title: string;
    detail: string | null;
    triggerSpec: unknown;
    repeatDays: number | null;
    customised: boolean;
    sourceStepKey: string | null;
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await trpc.program2.deleteStep.mutate({ orchardId, key: step.key });
      toast.success(
        step.sourceStepKey
          ? `Removed. It stays recommended for your region, and will show as not adopted.`
          : 'Removed.'
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the step');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return <StepEditor orchardId={orchardId} step={step} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setEditing(true)}
        aria-label={`Edit ${step.title}`}
        className="p-1.5 text-bark hover:text-ink hover:bg-canopy-50 rounded"
      >
        <Pencil size={14} aria-hidden />
      </button>
      <button
        onClick={remove}
        disabled={busy}
        aria-label={`Remove ${step.title}`}
        className="p-1.5 text-bark hover:text-flag-600 hover:bg-canopy-50 rounded disabled:opacity-50"
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </div>
  );
}
