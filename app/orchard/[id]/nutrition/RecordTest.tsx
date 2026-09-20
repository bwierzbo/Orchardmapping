'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { LEAF_SUFFICIENCY, NUTRIENTS, type Nutrient } from '@/lib/nutrition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Typing a lab report in.
 *
 * Every field is optional on purpose — labs run different panels, and a
 * report missing sulfur should not be unenterable. An empty box means
 * "not measured", which the assessment reports as its own verdict
 * rather than as a deficiency.
 */
export default function RecordTest({ orchardId }: { orchardId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sampledOn, setSampledOn] = useState('');
  const [sampleArea, setSampleArea] = useState('');
  const [lab, setLab] = useState('');
  const [values, setValues] = useState<Partial<Record<Nutrient, string>>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!sampledOn) {
      toast.error('When was it sampled?');
      return;
    }
    const parsed: Partial<Record<Nutrient, number>> = {};
    for (const n of NUTRIENTS) {
      const raw = values[n];
      if (raw === undefined || raw.trim() === '') continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        toast.error(`${LEAF_SUFFICIENCY[n].label} is not a number`);
        return;
      }
      parsed[n] = num;
    }
    setBusy(true);
    try {
      await trpc.nutrition.recordTissue.mutate({
        orchardId,
        sampledOn,
        sampleArea: sampleArea.trim() || undefined,
        lab: lab.trim() || undefined,
        values: parsed,
      });
      toast.success('Leaf test recorded');
      setValues({});
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the test');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Enter a leaf test
      </Button>
    );
  }

  return (
    <section className="bg-surface border border-line rounded-lg p-4">
      <h2 className="font-display text-lg text-ink">Enter a leaf test</h2>
      <p className="text-xs text-bark mt-0.5 mb-3">
        Leave anything the lab did not run blank &mdash; blank reads as not measured, which
        is not the same as zero.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Sampled on</Label>
          <Input type="date" value={sampledOn} onChange={(e) => setSampledOn(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Area</Label>
          <Input
            value={sampleArea}
            onChange={(e) => setSampleArea(e.target.value)}
            placeholder="Whole block"
          />
        </div>
        <div>
          <Label className="text-xs">Lab</Label>
          <Input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mt-3">
        {NUTRIENTS.map((n) => {
          const r = LEAF_SUFFICIENCY[n];
          return (
            <div key={n}>
              <Label className="text-xs" htmlFor={`nut-${n}`}>
                {r.label}{' '}
                <span className="text-bark">({r.unit === 'percent' ? '%' : 'ppm'})</span>
              </Label>
              <Input
                id={`nut-${n}`}
                inputMode="decimal"
                value={values[n] ?? ''}
                onChange={(e) => setValues({ ...values, [n]: e.target.value })}
                placeholder={`${r.low}–${r.high}`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mt-4">
        <Button onClick={save} disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
          Save test
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
