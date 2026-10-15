'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { ArrowLeft } from 'lucide-react';
import {
  FRUIT_METRIC_CATALOG,
  type WalkSettings,
} from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Setup menu — the app is capability-complete; this page scopes it to
 * how each operation actually works (500 trees or 500 acres).
 */
export default function SettingsPage() {
  const { isSignedIn } = useAuth();
  const [walk, setWalk] = useState<WalkSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((b) => setWalk(b.walk))
      .catch(() => setWalk(null));
  }, []);

  const save = async () => {
    if (!walk) return;
    setSaving(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walk }),
      });
      if (r.ok) setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const radio = (
    label: string,
    checked: boolean,
    onSelect: () => void,
    hint?: string
  ) => (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="mt-1 accent-[rgb(var(--canopy-600))]"
      />
      <span>
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-bark">{hint}</span>}
      </span>
    </label>
  );

  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-xl mx-auto px-4 py-6 pb-safe">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/" className="p-2 -m-2 rounded-lg text-bark hover:text-ink">
            <ArrowLeft size={20} aria-hidden />
          </Link>
          <div>
            <h1 className="font-display text-2xl text-ink">Settings</h1>
            <p className="survey-caption">Scope the app to your operation</p>
          </div>
        </div>

        {!walk ? (
          <p className="text-sm text-bark">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bloom survey scale</CardTitle>
                <CardDescription>
                  The phenology ladder shown during a bloom walk.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {radio(
                  'Simplified (6 stages)',
                  walk.bloomScale === 'simple',
                  () => setWalk({ ...walk, bloomScale: 'simple' }),
                  'Dormant · Green Tip · Tight Cluster · Pink · Full Bloom · Petal Fall'
                )}
                {radio(
                  'Full (10 stages)',
                  walk.bloomScale === 'full',
                  () => setWalk({ ...walk, bloomScale: 'full' }),
                  'Adds Silver Tip, Half-Inch Green, First Bloom, Fruit Set'
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bloom & fruit survey scope</CardTitle>
                <CardDescription>
                  Health walks always visit every tree; bloom and fruit passes can sample.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {radio(
                  'Every tree',
                  walk.surveyScope === 'per_tree',
                  () => setWalk({ ...walk, surveyScope: 'per_tree' }),
                  'Best for mixed plantings where varieties change within rows'
                )}
                {radio(
                  'Sample each variety run',
                  walk.surveyScope === 'variety_sample',
                  () => setWalk({ ...walk, surveyScope: 'variety_sample' }),
                  'Visits the first N trees of each contiguous variety stretch per row'
                )}
                {walk.surveyScope === 'variety_sample' && (
                  <div className="flex items-center gap-2 pl-6 pt-1">
                    <Label className="text-xs text-bark">Trees per variety run</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={walk.sampleSize}
                      onChange={(e) =>
                        setWalk({ ...walk, sampleSize: Number(e.target.value) || 1 })
                      }
                      className="h-8 w-20"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fruit measurements</CardTitle>
                <CardDescription>
                  What the fruit pass asks for beyond the 1–5 crop-load rating.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="pb-2 mb-1 border-b border-line space-y-2">
                  <p className="text-xs font-medium text-bark">Sugar unit</p>
                  {radio(
                    'Brix (°Bx)',
                    walk.sugarUnit === 'brix',
                    () => setWalk({ ...walk, sugarUnit: 'brix' }),
                    'Refractometer reading, stored as-is'
                  )}
                  {radio(
                    'Specific gravity (SG)',
                    walk.sugarUnit === 'sg',
                    () => setWalk({ ...walk, sugarUnit: 'sg' }),
                    'Enter SG (e.g. 1.050); stored as both SG and converted °Bx'
                  )}
                </div>
                {FRUIT_METRIC_CATALOG.map((m) => (
                  <label key={m.key} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={walk.fruitMetrics.includes(m.key)}
                      onChange={(e) =>
                        setWalk({
                          ...walk,
                          fruitMetrics: e.target.checked
                            ? [...walk.fruitMetrics, m.key]
                            : walk.fruitMetrics.filter((k) => k !== m.key),
                        })
                      }
                      className="accent-[rgb(var(--canopy-600))]"
                    />
                    <span className="text-sm text-ink">
                      {m.label} <span className="text-xs text-bark">({m.unit})</span>
                    </span>
                  </label>
                ))}
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-3">
              {savedAt && <span className="text-xs text-bark">Saved</span>}
              <Button onClick={save} disabled={saving || !isSignedIn}>
                {saving ? 'Saving…' : isSignedIn ? 'Save settings' : 'Sign in to save'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
