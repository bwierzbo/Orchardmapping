'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import type { Region } from '@/lib/db/regions';

/**
 * Which climate this orchard's agronomy is calibrated for.
 *
 * Shown rather than hidden because every model on the dashboard depends
 * on it, and because it used to be an assumption baked into the code: Nov
 * to Apr chill, codling moth counted from January 1, scab run
 * high-inoculum, fire blight dismissed. Those are defensible here and
 * wrong elsewhere, and a grower cannot judge them if they cannot see them.
 *
 * Changing it is an admin action, and "not set" is a legitimate answer —
 * better than being handed another climate's calendar.
 */
export default function RegionCard({
  orchardId,
  region,
  regions,
  canEdit,
}: {
  orchardId: string;
  region: Region | null;
  regions: Region[];
  canEdit: boolean;
}) {
  const [current, setCurrent] = useState<Region | null>(region);
  const [saving, setSaving] = useState(false);

  async function change(key: string) {
    const next = key ? (regions.find((r) => r.key === key) ?? null) : null;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    try {
      await trpc.orchard.setRegion.mutate({ orchardId, regionKey: key || null });
      toast.success(next ? `Region set to ${next.name}.` : 'Region cleared.');
    } catch (e) {
      setCurrent(previous);
      toast.error(e instanceof Error ? e.message : 'Could not change the region');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="survey-caption mb-2">Region</h2>

      {current ? (
        <>
          <p className="text-sm font-medium text-ink">
            {current.name}
            {current.ecoregionCode && (
              <span className="ml-1.5 font-mono text-xs text-bark">
                EPA {current.ecoregionCode}
                {current.ecoregionParent ? ` · ${current.ecoregionParent}` : ''}
              </span>
            )}
          </p>
          {current.description && (
            <p className="mt-1 text-xs text-bark">{current.description}</p>
          )}

          <dl className="mt-3 font-mono text-xs text-ink space-y-0.5">
            <Row
              label="chill"
              value={`${current.chillStartMmdd} → ${current.chillEndMmdd}`}
              wired
            />
            <Row
              label="codling moth"
              value={
                current.cmAccumulation === 'jan1'
                  ? 'no biofix, from Jan 1'
                  : 'from first sustained catch'
              }
            />
            <Row label="generations" value={current.cmGenerations ?? 'unknown'} />
            <Row label="scab" value={`${current.scabInoculum ?? 'unset'} inoculum`} />
            <Row
              label="wet hour"
              value={`${current.wetnessRhPct ?? 90}% RH, ${current.wetnessPrecipMm ?? 0.2}mm rain`}
              wired
            />
          </dl>

          <p className="mt-2 text-xs text-bark">
            Marked settings are read by the models. The rest are recorded here and still
            hardcoded elsewhere — they move across as the program is rebuilt. Codling moth
            accumulation is read when a program is adopted, not afterwards.
          </p>
        </>
      ) : (
        <p className="text-sm text-ink">
          No region chosen. Pest and spray guidance is calibrated per climate, so none is
          offered until one is set.
        </p>
      )}

      {canEdit && (
        <div className="mt-3">
          <label className="sr-only" htmlFor="region-select">
            Region for this orchard
          </label>
          <select
            id="region-select"
            value={current?.key ?? ''}
            disabled={saving}
            onChange={(e) => change(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-line bg-surface text-ink disabled:opacity-50"
          >
            <option value="">Not set</option>
            {regions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
                {r.ecoregionCode ? ` (${r.ecoregionCode})` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-bark">
            Suggested from where the orchard sits, but yours to decide — the rain shadow&rsquo;s
            published boundary runs east through Port Townsend, so the edge is a judgement
            call.
          </p>
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  wired = false,
}: {
  label: string;
  value: string | number;
  wired?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-28 text-bark">{label}</span>
      <span>{value}</span>
      {wired && <span className="text-canopy-700">· in use</span>}
    </div>
  );
}
