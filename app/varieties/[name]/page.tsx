import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@vercel/postgres';
import { ArrowLeft, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  BSH: 'Bittersharp',
  SH: 'Sharp',
  BSW: 'Bittersweet',
  SW: 'Sweet',
  dessert: 'Dessert',
  crab: 'Crab',
};

function Field({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-line last:border-0">
      <span className="text-sm text-bark shrink-0">{label}</span>
      <span className="text-sm font-medium text-ink text-right">{value}</span>
    </div>
  );
}

function Sources({ sources }: { sources: string | null }) {
  if (!sources) return null;
  const urls = sources.split(';').map((s) => s.trim()).filter(Boolean);
  return (
    <div className="mt-4">
      <p className="survey-caption mb-1">Sources</p>
      <ul className="space-y-1">
        {urls.map((u) => (
          <li key={u}>
            <a
              href={u}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-canopy-700 hover:underline break-all"
            >
              <ExternalLink size={11} aria-hidden className="shrink-0" />
              {u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Variety (or rootstock:NAME) detail page — the full curated record. */
export default async function VarietyDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: raw } = await params;
  const name = decodeURIComponent(raw);

  if (name.startsWith('rootstock:')) {
    const stock = name.slice('rootstock:'.length);
    const { rows } = await sql`SELECT * FROM rootstock_attributes WHERE rootstock = ${stock}`;
    const r = rows[0];
    if (!r) notFound();
    return (
      <main className="min-h-dvh bg-paper">
        <div className="max-w-2xl mx-auto px-4 py-6 pb-safe">
          <Link href="/varieties" className="inline-flex items-center gap-1 text-sm text-bark hover:text-ink">
            <ArrowLeft size={16} aria-hidden /> Variety Library
          </Link>
          <h1 className="font-display text-2xl text-ink mt-2">{r.rootstock}</h1>
          <p className="survey-caption mb-4">Rootstock · confidence {r.confidence}</p>
          <div className="rounded-xl border border-line bg-surface p-4">
            <Field label="Vigor" value={r.vigor_pct} />
            <Field label="Precocity" value={r.precocity} />
            <Field label="Anchorage" value={r.anchorage} />
          </div>
          <div className="mt-4 space-y-3 text-sm text-ink">
            <p className="whitespace-pre-wrap">{r.description}</p>
            {r.disease_notes && (
              <p className="whitespace-pre-wrap">
                <span className="font-medium">Disease: </span>
                {r.disease_notes}
              </p>
            )}
          </div>
          <Sources sources={r.reference_sources} />
        </div>
      </main>
    );
  }

  const { rows } = await sql`SELECT * FROM variety_attributes WHERE variety = ${name}`;
  const v = rows[0];
  if (!v) notFound();
  const { rows: countRows } = await sql`
    SELECT COUNT(*)::int AS n FROM trees WHERE variety = ${name}
  `;
  const treeCount = countRows[0]?.n ?? 0;

  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-safe">
        <Link href="/varieties" className="inline-flex items-center gap-1 text-sm text-bark hover:text-ink">
          <ArrowLeft size={16} aria-hidden /> Variety Library
        </Link>
        <h1 className="font-display text-2xl text-ink mt-2">{v.variety}</h1>
        <p className="survey-caption mb-4">
          {v.cider_type ? (TYPE_LABEL[v.cider_type] ?? v.cider_type) : 'Unclassified'}
          {treeCount > 0 ? ` · ${treeCount} trees planted` : ' · not planted'}
          {' · confidence '}{v.confidence}
        </p>

        <div className="rounded-xl border border-line bg-surface p-4">
          <Field label="Origin" value={v.origin} />
          <Field label="Ploidy" value={v.ploidy !== 'unknown' ? v.ploidy : null} />
          <Field label="Bloom group" value={v.bloom_group ? `${v.bloom_group} (1 early … 5 late)` : null} />
          <Field label="Harvest" value={v.harvest_window ?? v.ripen_hint} />
          <Field label="Acidity" value={v.acidity} />
          <Field label="Tannin" value={v.tannin} />
          <Field label="Typical SG" value={v.typical_sg} />
          <Field label="Vigor" value={v.vigor} />
          <Field label="Biennial tendency" value={v.biennial_tendency !== 'unknown' ? v.biennial_tendency : null} />
          <Field label="Pollinator pairing" value={v.pollinator} />
        </div>

        <div className="mt-4 space-y-3 text-sm text-ink">
          {v.description && <p className="whitespace-pre-wrap">{v.description}</p>}
          {v.disease_notes && (
            <p className="whitespace-pre-wrap">
              <span className="font-medium">Disease: </span>
              {v.disease_notes}
            </p>
          )}
          {v.notes && (
            <div className="rounded-lg border border-flag-600/30 bg-flag-600/5 p-3">
              <p className="text-xs whitespace-pre-wrap text-ink">{v.notes}</p>
            </div>
          )}
        </div>

        <Sources sources={v.reference_sources} />
      </div>
    </main>
  );
}
