'use client';

import { useEffect, useState } from 'react';
import {
  fetchTreeEvents,
  createTreeEvent,
  type ClientTreeEvent,
} from '@/lib/api/trees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhotoButton from '@/components/PhotoButton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  bloomStagesFor,
  normalizeWalkSettings,
  DEFAULT_WALK_SETTINGS,
  FRUIT_METRIC_CATALOG,
  type WalkSettings,
} from '@/lib/settings';
import { sgToBrix } from '@/lib/sugar';

const EVENT_LABEL: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  status_change: 'Status changed',
  moved: 'Moved',
  deleted: 'Deleted',
  pruning: 'Pruned',
  spray: 'Sprayed',
  fertilize: 'Fertilized',
  observation: 'Observation',
  harvest: 'Harvested',
  note: 'Note',
  bloom: 'Bloom stage',
  fruit_check: 'Fruit check',
};

const MANUAL_TYPES = [
  'observation',
  'bloom',
  'fruit_check',
  'pruning',
  'spray',
  'fertilize',
  'harvest',
  'note',
];

/** Compact "field: a → b" summary for automatic audit events. */
function changesSummary(changes: ClientTreeEvent['changes']): string | null {
  if (!changes) return null;
  const parts = Object.entries(changes)
    .filter(([k]) => k !== 'snapshot')
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.from ?? '—'} → ${v.to ?? '—'}`);
  if (parts.length === 0) return null;
  const more = Object.keys(changes).length - parts.length;
  return parts.join(' · ') + (more > 0 ? ` (+${more} more)` : '');
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Per-tree history: automatic audit events plus manually logged field
 * activities (pruning, spray, …). Rendered inside the tree detail panel.
 */
export default function TreeHistory({
  treeId,
  canEdit,
}: {
  treeId: string;
  canEdit: boolean;
}) {
  const [events, setEvents] = useState<ClientTreeEvent[] | null>(null);
  const [logging, setLogging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eventType, setEventType] = useState('observation');
  const [eventDate, setEventDate] = useState(todayYMD());
  const [detail, setDetail] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // Structured entries (bloom stage / fruit check), sharing the walk
  // pass definitions so panel logs and Walk Mode logs stay identical
  const [settings, setSettings] = useState<WalkSettings>(DEFAULT_WALK_SETTINGS);
  const [bloomStage, setBloomStage] = useState<string | null>(null);
  const [fruitLoad, setFruitLoad] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Record<string, string>>({});

  // The panel mounts this with key={treeId}, so state resets per tree —
  // the effect only fetches (no synchronous setState).
  useEffect(() => {
    let cancelled = false;
    fetchTreeEvents(treeId)
      .then((e) => !cancelled && setEvents(e))
      .catch(() => !cancelled && setEvents([]));
    fetch('/api/settings')
      .then((r) => r.json())
      .then((b) => !cancelled && b?.walk && setSettings(normalizeWalkSettings(b.walk)))
      .catch(() => {}); // defaults are fine offline
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const structuredPayload = (): {
    detail?: string;
    changes?: Record<string, unknown>;
  } | null => {
    if (eventType === 'bloom') {
      if (!bloomStage) return null;
      return { detail: bloomStage, changes: { stage: bloomStage } };
    }
    if (eventType === 'fruit_check') {
      if (fruitLoad === null) return null;
      const payload: Record<string, unknown> = { load: fruitLoad };
      for (const m of FRUIT_METRIC_CATALOG) {
        const raw = metrics[m.key];
        if (raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) {
          const value = Number(raw);
          // Sugar is stored canonically as °Bx; keep entered SG alongside
          if (m.key === 'brix' && settings.sugarUnit === 'sg') {
            payload.brix = Math.round(sgToBrix(value) * 10) / 10;
            payload.sg = value;
          } else {
            payload[m.key] = value;
          }
        }
      }
      return { detail: `Load ${fruitLoad}/5`, changes: payload };
    }
    return { detail: detail || undefined };
  };

  const structuredReady =
    eventType === 'bloom' ? bloomStage !== null : eventType === 'fruit_check' ? fruitLoad !== null : true;

  const submit = async () => {
    const structured = structuredPayload();
    if (!structured) return;
    setSaving(true);
    try {
      const updated = await createTreeEvent(treeId, {
        event_type: eventType,
        event_date: eventDate,
        ...structured,
        photo_url: photoUrl ?? undefined,
      });
      setEvents(updated);
      setLogging(false);
      setDetail('');
      setPhotoUrl(null);
      setBloomStage(null);
      setFruitLoad(null);
      setMetrics({});
      setEventDate(todayYMD());
    } catch {
      // parseResponse surfaces the message via ApiError; keep the form open
    } finally {
      setSaving(false);
    }
  };

  const enabledMetrics = FRUIT_METRIC_CATALOG.filter((m) =>
    settings.fruitMetrics.includes(m.key)
  );

  return (
    <div className="pt-3 mt-1 border-t border-line">
      <div className="flex items-center justify-between">
        <span className="survey-caption">History</span>
        {canEdit && !logging && (
          <Button variant="ghost" size="sm" onClick={() => setLogging(true)}>
            Log event
          </Button>
        )}
      </div>

      {logging && (
        <div className="mt-2 space-y-2 rounded-lg border border-line p-2.5 bg-paper/60">
          <div className="grid grid-cols-2 gap-2">
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              className="h-8 text-sm"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
          {eventType === 'bloom' && (
            <div className="flex flex-wrap gap-1.5">
              {bloomStagesFor(settings).map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setBloomStage(stage)}
                  className={`px-2 py-1 rounded-md text-xs font-medium border ${
                    bloomStage === stage
                      ? 'bg-canopy-600 text-white dark:text-paper border-canopy-600'
                      : 'bg-paper text-ink border-line hover:bg-canopy-50'
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          )}
          {eventType === 'fruit_check' && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-bark mr-1">Load</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFruitLoad(n)}
                    className={`w-8 h-8 rounded-md text-sm font-semibold border ${
                      fruitLoad === n
                        ? 'bg-canopy-600 text-white dark:text-paper border-canopy-600'
                        : 'bg-paper text-ink border-line hover:bg-canopy-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {fruitLoad !== null && enabledMetrics.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {enabledMetrics.map((m) => (
                    <label key={m.key} className="block">
                      <span className="text-[11px] text-bark">
                        {m.key === 'brix' && settings.sugarUnit === 'sg'
                          ? 'SG (hydrometer)'
                          : m.label}
                      </span>
                      <Input
                        type="number"
                        step={m.key === 'brix' && settings.sugarUnit === 'sg' ? 0.001 : m.step}
                        className="h-8 text-sm mt-0.5"
                        value={metrics[m.key] ?? ''}
                        onChange={(e) =>
                          setMetrics((prev) => ({ ...prev, [m.key]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          {eventType !== 'bloom' && eventType !== 'fruit_check' && (
            <Input
              placeholder="Notes (optional)"
              className="h-8 text-sm"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          )}
          <div className="flex items-center gap-2">
            <PhotoButton
              treeId={treeId}
              onUploaded={setPhotoUrl}
              className="h-8 px-2.5"
              label={photoUrl ? 'Retake' : 'Photo'}
            />
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Attached" className="h-8 w-8 rounded object-cover border border-line" />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setLogging(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={saving || !structuredReady}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {events === null ? (
        <p className="text-xs text-bark mt-2">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-bark mt-2">No history yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="text-xs leading-snug">
              <span className="font-mono text-bark">{e.event_date ?? ''}</span>{' '}
              <span className="font-medium text-ink">
                {EVENT_LABEL[e.event_type] ?? e.event_type}
              </span>
              {e.detail ? <span className="text-bark"> — {e.detail}</span> : null}
              {!e.detail && changesSummary(e.changes) ? (
                <span className="text-bark"> — {changesSummary(e.changes)}</span>
              ) : null}
              {e.photo_url && (
                <a href={e.photo_url} target="_blank" rel="noreferrer" className="block mt-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.photo_url}
                    alt="Event photo"
                    className="h-14 w-14 rounded-md object-cover border border-line hover:opacity-90"
                  />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
