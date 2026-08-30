'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Download,
  FileUp,
  Loader2,
  MapPinOff,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import {
  parseTreeCSV,
  generateTemplateCSV,
  downloadBlob,
  type ParseResult,
  type TreeImportRow,
} from '@/lib/csv-parser';
import { rowPositionKey } from '@/lib/row-id';
import type { ClientTree } from '@/lib/types';

interface BulkTreeImportProps {
  orchardId: string;
  /** Current trees, used to preview which rows create vs update */
  existingTrees: ClientTree[];
  onImportComplete?: () => void;
}

type Step = 'pick' | 'review' | 'importing';

export default function BulkTreeImport({
  orchardId,
  existingTrees,
  onImportComplete,
}: BulkTreeImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  // true after hydration (portal target exists)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setStep('pick');
    setParsed(null);
    setFileName('');
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'importing') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, step, close]);

  const existingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const t of existingTrees) {
      if (t.row_id != null && t.position != null) {
        keys.add(rowPositionKey(t.row_id, t.position));
      }
    }
    return keys;
  }, [existingTrees]);

  const summary = useMemo(() => {
    if (!parsed) return null;
    let created = 0;
    let updated = 0;
    let noCoords = 0;
    for (const row of parsed.data) {
      const exists = existingKeys.has(rowPositionKey(row.row_id, row.position));
      if (exists) updated++;
      else {
        created++;
        if (row.lat == null || row.lng == null) noCoords++;
      }
    }
    return { created, updated, noCoords };
  }, [parsed, existingKeys]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const result = await parseTreeCSV(file);
    setParsed(result);
    setStep('review');
  };

  const runImport = async () => {
    if (!parsed || parsed.data.length === 0) return;
    setStep('importing');
    try {
      const response = await fetch('/api/trees/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orchard_id: orchardId, updates: parsed.data }),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(result.errors) ? ` — ${result.errors[0]}` : '';
        throw new Error((result.error || 'Import failed') + detail);
      }
      toast.success(
        `Imported ${result.created + result.updated} trees (${result.created} new, ${result.updated} updated)`
      );
      onImportComplete?.();
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
      setStep('review');
    }
  };

  const rowStatus = (row: TreeImportRow) =>
    existingKeys.has(rowPositionKey(row.row_id, row.position)) ? 'update' : 'new';

  const dialog = isOpen ? (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
        onClick={step !== 'importing' ? close : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import tree data"
        className="relative bg-surface w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-xl border border-line shadow-lg flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h2 className="text-lg font-semibold text-ink">Import tree data</h2>
            <p className="text-xs text-bark mt-0.5">
              {step === 'pick' && 'CSV with row_id + position; add lat/lng to place trees on the map.'}
              {step === 'review' && fileName}
              {step === 'importing' && 'Importing…'}
            </p>
          </div>
          <button
            onClick={close}
            disabled={step === 'importing'}
            aria-label="Close import dialog"
            className="p-2 -m-1 rounded-lg text-bark/70 hover:text-ink hover:bg-canopy-50 disabled:opacity-40"
          >
            <X aria-hidden size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {step === 'pick' && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors duration-base ${
                  dragging ? 'border-canopy-600 bg-canopy-50' : 'border-line'
                }`}
              >
                <FileUp aria-hidden className="mx-auto text-canopy-600" size={30} />
                <p className="mt-3 text-sm font-medium text-ink">
                  Drag and drop your CSV here
                </p>
                <p className="text-xs text-bark mt-1">or</p>
                <label className="inline-block mt-2 px-4 py-2 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700 cursor-pointer">
                  Choose file
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </label>
              </div>

              <div className="mt-4 flex items-start justify-between gap-4">
                <p className="text-xs text-bark">
                  Columns: <span className="font-mono">row_id, position</span> (required) ·{' '}
                  <span className="font-mono">lat, lng, variety, status, planted_date, age,
                  height, last_pruned, last_harvest, yield_estimate, notes</span>.
                  Rows matching an existing row/position update that tree; everything runs in
                  one transaction.
                </p>
                <button
                  onClick={() => downloadBlob(generateTemplateCSV(), 'tree-import-template.csv')}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-canopy-600 hover:text-canopy-700"
                >
                  <Download aria-hidden size={14} /> Template
                </button>
              </div>
            </>
          )}

          {(step === 'review' || step === 'importing') && parsed && (
            <>
              {/* Summary chips */}
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className="px-2.5 py-1 rounded-full bg-canopy-50 text-canopy-700">
                  {summary?.created ?? 0} new
                </span>
                <span className="px-2.5 py-1 rounded-full bg-paper text-bark border border-line">
                  {summary?.updated ?? 0} updates
                </span>
                {parsed.errors.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-status-dead/10 text-status-dead">
                    {parsed.errors.length} error{parsed.errors.length === 1 ? '' : 's'}
                  </span>
                )}
                {(summary?.noCoords ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-status-stressed/10 text-status-stressed">
                    <MapPinOff aria-hidden size={12} /> {summary?.noCoords} without coordinates
                  </span>
                )}
              </div>

              {parsed.warnings.map((w) => (
                <p key={w} className="flex items-start gap-1.5 mt-3 text-xs text-status-stressed">
                  <TriangleAlert aria-hidden size={14} className="shrink-0 mt-px" /> {w}
                </p>
              ))}

              {parsed.errors.length > 0 && (
                <div className="mt-3 border border-status-dead/30 bg-status-dead/5 rounded-md p-3 max-h-36 overflow-y-auto">
                  <p className="text-xs font-semibold text-status-dead mb-1.5">
                    Fix these rows and re-upload — nothing imports while errors remain:
                  </p>
                  <ul className="text-xs text-status-dead space-y-0.5">
                    {parsed.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {parsed.errors.length > 50 && (
                      <li>…and {parsed.errors.length - 50} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {parsed.data.length > 0 && (
                <div className="mt-4 border border-line rounded-md overflow-hidden">
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-paper sticky top-0">
                        <tr className="text-left text-bark">
                          <th className="px-3 py-2 font-medium">Row</th>
                          <th className="px-3 py-2 font-medium">Pos</th>
                          <th className="px-3 py-2 font-medium">Variety</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Coords</th>
                          <th className="px-3 py-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-ink">
                        {parsed.data.map((row, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 font-mono">{row.row_id}</td>
                            <td className="px-3 py-1.5 font-mono">{row.position}</td>
                            <td className="px-3 py-1.5">{row.variety ?? '—'}</td>
                            <td className="px-3 py-1.5">{row.status ?? '—'}</td>
                            <td className="px-3 py-1.5">
                              {row.lat != null ? (
                                <span className="font-mono text-bark">
                                  {row.lat.toFixed(5)}, {row.lng?.toFixed(5)}
                                </span>
                              ) : (
                                <span className="text-status-stressed">none</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              {rowStatus(row) === 'new' ? (
                                <span className="text-canopy-600 font-medium">create</span>
                              ) : (
                                <span className="text-bark">update</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {(step === 'review' || step === 'importing') && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-line">
            <button
              onClick={() => {
                setParsed(null);
                setFileName('');
                setStep('pick');
              }}
              disabled={step === 'importing'}
              className="text-sm text-bark hover:text-ink disabled:opacity-40"
            >
              ← Different file
            </button>
            <button
              onClick={runImport}
              disabled={step === 'importing' || !parsed || parsed.errors.length > 0 || parsed.data.length === 0}
              className="px-5 py-2.5 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {step === 'importing' ? (
                <Loader2 aria-hidden size={15} className="animate-spin" />
              ) : (
                <Upload aria-hidden size={15} />
              )}
              Import {parsed?.data.length ?? 0} trees
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-surface text-ink hover:bg-canopy-50 flex items-center gap-2"
      >
        <Upload aria-hidden size={15} /> Import CSV
      </button>
      {mounted && dialog && createPortal(dialog, document.body)}
    </>
  );
}
