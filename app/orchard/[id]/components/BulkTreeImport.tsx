'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { parseTreeCSV, TreeImportRow } from '@/lib/csv-parser';

interface BulkTreeImportProps {
  orchardId: string;
  onImportComplete?: () => void;
}

export default function BulkTreeImport({ orchardId, onImportComplete }: BulkTreeImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<TreeImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    updated: number;
    total: number;
    errors: Array<{ row_id: string; position: number; error: string }>;
  } | null>(null);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setImportResult(null);
    setParseErrors([]);
    setPreviewData([]);

    // Parse the file
    const result = await parseTreeCSV(file);

    if (result.success) {
      setPreviewData(result.data);
      setParseErrors(result.errors);
    } else {
      setParseErrors(result.errors);
    }
  }, []);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx'))) {
      await handleFileSelect(file);
    } else {
      setParseErrors(['Please select a valid CSV or Excel file']);
    }
  }, [handleFileSelect]);

  // Handle file input change
  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Import data
  const handleImport = useCallback(async () => {
    if (!previewData.length) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const response = await fetch('/api/trees/bulk-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orchard_id: orchardId,
          updates: previewData,
        }),
      });

      const result = await response.json();

      setImportResult({
        success: result.success,
        updated: result.updated || 0,
        total: result.total || 0,
        errors: result.errors || [],
      });

      if (result.success && onImportComplete) {
        onImportComplete();
      }
    } catch (error: any) {
      setImportResult({
        success: false,
        updated: 0,
        total: previewData.length,
        errors: [{ row_id: 'N/A', position: 0, error: error.message }],
      });
    } finally {
      setIsImporting(false);
    }
  }, [previewData, orchardId, onImportComplete]);

  // Reset and close
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSelectedFile(null);
    setPreviewData([]);
    setParseErrors([]);
    setImportResult(null);
  }, []);

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        Import Tree Data
      </button>

      {/* Modal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          {/* Modal Content */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={handleClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Import Tree Data</h2>
                    <p className="text-sm text-gray-500 mt-1">Upload CSV or Excel file with tree information</p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Instructions */}
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">File Format Requirements:</h3>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p><strong>Required columns (first two):</strong></p>
                    <ul className="ml-4 list-disc">
                      <li><code className="bg-blue-100 px-1 rounded">row_id</code> - Row identifier (e.g., "R01", "1", "A")</li>
                      <li><code className="bg-blue-100 px-1 rounded">position</code> - Position number in row (e.g., 1, 2, 3)</li>
                    </ul>
                    <p className="mt-2"><strong>Optional columns (any order):</strong></p>
                    <ul className="ml-4 list-disc">
                      <li><code className="bg-blue-100 px-1 rounded">variety</code> - Tree variety name</li>
                      <li><code className="bg-blue-100 px-1 rounded">status</code> - healthy, stressed, dead, or unknown</li>
                      <li><code className="bg-blue-100 px-1 rounded">planted_date</code> - YYYY-MM-DD format</li>
                      <li><code className="bg-blue-100 px-1 rounded">age</code> - Age in years (number)</li>
                      <li><code className="bg-blue-100 px-1 rounded">last_pruned</code> - YYYY-MM-DD format</li>
                      <li><code className="bg-blue-100 px-1 rounded">last_harvest</code> - YYYY-MM-DD format</li>
                      <li><code className="bg-blue-100 px-1 rounded">yield_estimate</code> - Harvest yield in kg (number)</li>
                      <li><code className="bg-blue-100 px-1 rounded">notes</code> - Any notes or observations</li>
                    </ul>
                  </div>
                  <a
                    href="/templates/tree-data-template.csv"
                    download="tree-data-template.csv"
                    className="mt-3 inline-block px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
                  >
                    Download Template CSV
                  </a>
                </div>

                {/* File Upload Area */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      <svg className="w-12 h-12 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-sm text-gray-500">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                      <button
                        onClick={() => {
                          setSelectedFile(null);
                          setPreviewData([]);
                          setParseErrors([]);
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Change file
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-600">Drag and drop your CSV or Excel file here</p>
                      <p className="text-sm text-gray-500">or</p>
                      <label className="inline-block px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                        Browse Files
                        <input
                          type="file"
                          accept=".csv,.xlsx"
                          onChange={handleFileInputChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Parse Errors */}
                {parseErrors.length > 0 && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                    <h4 className="font-semibold text-red-900 mb-2">Errors Found:</h4>
                    <ul className="text-sm text-red-800 space-y-1">
                      {parseErrors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Preview Table */}
                {previewData.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">
                        Preview ({previewData.length} row{previewData.length !== 1 ? 's' : ''})
                      </h3>
                      <p className="text-sm text-gray-600">
                        Showing first {Math.min(5, previewData.length)} rows
                      </p>
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Row ID</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Position</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Variety</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Planted</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Age</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.slice(0, 5).map((row, index) => (
                            <tr key={index} className="border-b border-gray-100 last:border-0">
                              <td className="px-3 py-2 font-mono text-xs">{row.row_id}</td>
                              <td className="px-3 py-2">{row.position}</td>
                              <td className="px-3 py-2">{row.variety || '-'}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                    row.status === 'healthy'
                                      ? 'bg-green-100 text-green-800'
                                      : row.status === 'stressed'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : row.status === 'dead'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {row.status || 'unknown'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs">{row.planted_date || '-'}</td>
                              <td className="px-3 py-2">{row.age !== undefined ? `${row.age}y` : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Import Result */}
                {importResult && (
                  <div className={`mt-4 rounded-lg p-4 ${
                    importResult.success && importResult.errors.length === 0
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-yellow-50 border border-yellow-200'
                  }`}>
                    <h4 className={`font-semibold mb-2 ${
                      importResult.success && importResult.errors.length === 0
                        ? 'text-green-900'
                        : 'text-yellow-900'
                    }`}>
                      Import Complete
                    </h4>
                    <p className={`text-sm ${
                      importResult.success && importResult.errors.length === 0
                        ? 'text-green-800'
                        : 'text-yellow-800'
                    }`}>
                      Updated {importResult.updated} of {importResult.total} trees
                    </p>
                    {importResult.errors.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-yellow-900 mb-1">Errors:</p>
                        <ul className="text-sm text-yellow-800 space-y-1 max-h-40 overflow-y-auto">
                          {importResult.errors.map((error, index) => (
                            <li key={index}>
                              • Row {error.row_id}, Position {error.position}: {error.error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleImport}
                    disabled={previewData.length === 0 || isImporting}
                    className="flex-1 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isImporting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Import Data
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
