'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Ban, Check, Info, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  fetchMaterials,
  fetchRecommendations,
  fetchApplications,
  checkApplication,
  recordApplication,
  setProgramMode as apiSetProgramMode,
  removeApplication,
  type SprayApplicationView,
} from '@/lib/api/spray';
import type { Finding, SprayMaterial } from '@/lib/spray-rules';
import type { SprayTarget } from '@/lib/db/spray';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PROGRAM_MODES,
  PROGRAM_MODE_HELP,
  PROGRAM_MODE_LABEL,
  type ProgramMode,
} from '@/lib/spray-rules';

function localNow() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SprayClient({
  orchardId,
  targets,
}: {
  orchardId: string;
  /** From pest_library, via the page — see listSprayTargets(). */
  targets: SprayTarget[];
}) {
  // form fields
  const [target, setTarget] = useState('');
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [appliedAt, setAppliedAt] = useState(localNow);
  const [rateValue, setRateValue] = useState('');
  const [rateUnit, setRateUnit] = useState('');
  const [area, setArea] = useState('');
  const [applicator, setApplicator] = useState('');
  const [windMph, setWindMph] = useState('');
  const [airTempF, setAirTempF] = useState('');
  const [notes, setNotes] = useState('');

  const [mode, setModeState] = useState<ProgramMode>('organic_practices');
  const [materials, setMaterials] = useState<SprayMaterial[]>([]);
  const [applications, setApplications] = useState<SprayApplicationView[]>([]);
  const [recommendations, setRecommendations] = useState<SprayMaterial[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reloadMaterials = useCallback(async () => {
    const r = await fetchMaterials(orchardId);
    setModeState(r.mode);
    setMaterials(r.materials);
  }, [orchardId]);

  const reloadApplications = useCallback(async () => {
    setApplications(await fetchApplications(orchardId));
  }, [orchardId]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        await Promise.all([reloadMaterials(), reloadApplications()]);
      } catch (e) {
        if (live) toast.error(e instanceof Error ? e.message : 'Could not load');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [reloadMaterials, reloadApplications]);

  // Recommendations follow the chosen target
  useEffect(() => {
    if (!target) return;
    let live = true;
    void (async () => {
      try {
        const options = await fetchRecommendations(orchardId, target);
        if (live) setRecommendations(options);
      } catch {
        if (live) setRecommendations([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [orchardId, target]);

  // Live rule check as material/date change — before anything is saved
  useEffect(() => {
    if (materialId == null || Number.isNaN(Date.parse(appliedAt))) return;
    let live = true;
    void (async () => {
      try {
        const r = await checkApplication({
          orchardId,
          materialId,
          appliedAt: new Date(appliedAt).toISOString(),
        });
        if (!live) return;
        setFindings(r.findings);
        setBlocked(r.blocked);
      } catch {
        if (!live) return;
        setFindings([]);
        setBlocked(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [orchardId, materialId, appliedAt]);

  const changeMode = async (next: ProgramMode) => {
    try {
      await apiSetProgramMode(orchardId, next);
      await reloadMaterials();
      setMaterialId(null);
      toast.success(`Program set to ${PROGRAM_MODE_LABEL[next]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change program');
    }
  };

  const submit = async () => {
    if (materialId == null) return;
    setSaving(true);
    try {
      await recordApplication({
        orchardId,
        materialId,
        appliedAt: new Date(appliedAt).toISOString(),
        target: target || undefined,
        rateValue: rateValue ? Number(rateValue) : undefined,
        rateUnit: rateUnit || undefined,
        areaDescription: area || undefined,
        applicator: applicator || undefined,
        windMph: windMph ? Number(windMph) : undefined,
        airTempF: airTempF ? Number(airTempF) : undefined,
        notes: notes || undefined,
      });
      await reloadApplications();
      toast.success('Application recorded');
      setRateValue('');
      setNotes('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record');
    } finally {
      setSaving(false);
    }
  };

  const deleteOne = async (id: number) => {
    try {
      await removeApplication(id);
      await reloadApplications();
      toast.success('Application removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove');
    }
  };

  // Derived rather than cleared in an effect — no cascading renders
  const shownRecommendations = target ? recommendations : [];
  const shownFindings = materialId == null ? [] : findings;
  const isBlocked = materialId != null && blocked;

  const selected = useMemo(
    () => materials.find((m) => m.id === materialId) ?? null,
    [materials, materialId],
  );
  
  return (
    <div className="space-y-6">
      {/* ---- program mode ---------------------------------------------- */}
      <section className="bg-surface border border-line rounded-lg p-4">
        <h2 className="font-display text-lg text-ink">Program</h2>
        <p className="text-sm text-bark mt-0.5">
          Scopes which materials this orchard is offered, and what gets blocked.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {PROGRAM_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`text-left rounded-lg border-2 p-3 transition-colors ${
                mode === m
                  ? 'border-canopy-600 bg-canopy-50 dark:bg-canopy-600/10'
                  : 'border-line hover:border-canopy-600/50'
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                {mode === m && <Check size={14} className="text-canopy-600" aria-hidden />}
                {PROGRAM_MODE_LABEL[m]}
              </span>
              <span className="block text-xs text-bark mt-1">{PROGRAM_MODE_HELP[m]}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- record an application -------------------------------------- */}
      <section className="bg-surface border border-line rounded-lg p-4 space-y-3">
        <h2 className="font-display text-lg text-ink">Record an application</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">What are you treating?</Label>
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setMaterialId(null);
              }}
              className="w-full h-10 px-3 bg-surface text-ink border border-line rounded-md text-sm"
            >
              <option value="">Any / not listed</option>
              {targets.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Material</Label>
            <select
              value={materialId ?? ''}
              onChange={(e) => setMaterialId(e.target.value ? Number(e.target.value) : null)}
              className="w-full h-10 px-3 bg-surface text-ink border border-line rounded-md text-sm"
            >
              <option value="">Select material</option>
              {(shownRecommendations.length > 0 ? shownRecommendations : materials).map(
                (m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.omri_listed ? ' · OMRI' : ''}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        {/* Recommendation, in the order the rules rank them */}
        {shownRecommendations.length > 0 && (
          <div className="rounded-md border border-canopy-600/30 bg-canopy-50 dark:bg-canopy-600/10 p-3">
            <p className="text-xs font-medium text-ink">
              For {targets.find((t) => t.key === target)?.label}, in order:
            </p>
            <ol className="mt-1 space-y-1">
              {shownRecommendations.slice(0, 3).map((m, i) => (
                <li key={m.id} className="text-xs text-bark">
                  <button
                    type="button"
                    onClick={() => setMaterialId(m.id)}
                    className="font-medium text-canopy-700 dark:text-canopy-100 hover:underline"
                  >
                    {i + 1}. {m.name}
                  </button>
                  {m.notes ? ` — ${m.notes}` : ''}
                </li>
              ))}
            </ol>
          </div>
        )}

        {selected?.notes && !target && (
          <p className="text-xs text-bark">{selected.notes}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label className="text-xs">Applied at</Label>
            <Input
              type="datetime-local"
              value={appliedAt}
              onChange={(e) => setAppliedAt(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Rate</Label>
            <Input
              type="number"
              step="0.01"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              placeholder="per label"
            />
          </div>
          <div>
            <Label className="text-xs">Rate unit</Label>
            <Input
              value={rateUnit}
              onChange={(e) => setRateUnit(e.target.value)}
              placeholder="oz/gal"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Area treated</Label>
            <Input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Rows 1–8 / whole block"
            />
          </div>
          <div>
            <Label className="text-xs">Applicator</Label>
            <Input value={applicator} onChange={(e) => setApplicator(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Wind mph</Label>
              <Input
                type="number"
                value={windMph}
                onChange={(e) => setWindMph(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Temp °F</Label>
              <Input
                type="number"
                value={airTempF}
                onChange={(e) => setAirTempF(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs">Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Live findings from the rules engine, before anything is saved */}
        {shownFindings.length > 0 && (
          <ul className="space-y-1.5">
            {shownFindings.map((f, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 text-xs rounded-md p-2 ${
                  f.level === 'blocked'
                    ? 'bg-status-dead/10 text-status-dead'
                    : f.level === 'warning'
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'bg-canopy-50 text-bark dark:bg-canopy-600/10'
                }`}
              >
                {f.level === 'blocked' ? (
                  <Ban size={14} className="mt-0.5 shrink-0" aria-hidden />
                ) : f.level === 'warning' ? (
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                ) : (
                  <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                )}
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={submit}
            disabled={!materialId || isBlocked || saving}
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin mr-1.5" aria-hidden />
            ) : (
              <Plus size={15} className="mr-1.5" aria-hidden />
            )}
            Record application
          </Button>
          <p className="text-xs text-bark">
            Always follow the product label — it is the legal document for rates and
            restrictions.
          </p>
        </div>
      </section>

      {/* ---- history ----------------------------------------------------- */}
      <section className="bg-surface border border-line rounded-lg p-4">
        <h2 className="font-display text-lg text-ink">Application record</h2>
        {loading ? (
          <p className="text-sm text-bark mt-2">Loading…</p>
        ) : applications.length === 0 ? (
          <p className="text-sm text-bark mt-2">
            Nothing recorded yet. Applications logged here become your spray record.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {applications.map((a) => (
              <li key={a.id} className="py-2 flex items-start gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-medium">
                    {a.material_name}
                    {a.target ? (
                      <span className="text-bark font-normal">
                        {' '}
                        ·{' '}
                        {targets.find((t) => t.key === a.target)?.label ??
                          a.target.replace(/_/g, ' ')}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-bark">
                    {new Date(a.applied_at).toLocaleString()}
                    {a.rate_value ? ` · ${a.rate_value} ${a.rate_unit ?? ''}` : ''}
                    {a.area_description ? ` · ${a.area_description}` : ''}
                    {a.applicator ? ` · ${a.applicator}` : ''}
                  </p>
                  {a.notes && <p className="text-xs text-bark/80 mt-0.5">{a.notes}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => deleteOne(a.id)}
                  className="text-bark hover:text-destructive p-1"
                  aria-label="Remove application"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
