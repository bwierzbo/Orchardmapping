'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function NewOrchardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/orchards/new');
    }
  }, [status, router]);

  // Show loading state while checking auth
  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </main>
    );
  }

  // Don't render if not authenticated
  if (!session) {
    return null;
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      if (droppedFile.name.toLowerCase().endsWith('.pmtiles')) {
        setFile(droppedFile);
        setError('');
      } else {
        setError('Please upload a .pmtiles file');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const selectedFile = files[0];
      if (selectedFile.name.toLowerCase().endsWith('.pmtiles')) {
        setFile(selectedFile);
        setError('');
      } else {
        setError('Please upload a .pmtiles file');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setUploadProgress(0);

    try {
      // Validate inputs
      if (!name.trim()) {
        throw new Error('Orchard name is required');
      }
      if (!location.trim()) {
        throw new Error('Location is required');
      }
      if (!file) {
        throw new Error('PMTiles file is required');
      }

      // Create form data
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('location', location.trim());
      formData.append('pmtilesFile', file);

      // Simulate progress for large files
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      // Submit to API
      const response = await fetch('/api/orchards/create', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to create orchard');
      }

      // Success!
      setSuccess(true);

      // Redirect after 2 seconds
      setTimeout(() => {
        router.push(`/orchard/${result.orchardId}`);
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the orchard');
      setUploadProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.push('/');
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="max-w-3xl mx-auto mb-8">
          <button
            onClick={handleCancel}
            className="text-gray-600 hover:text-gray-900 mb-4 flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Orchards
          </button>

          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Add New Orchard
          </h1>
          <p className="text-gray-600">
            Upload a PMTiles file containing orthomosaic imagery to create a new orchard in the system.
          </p>
        </div>

        {/* Form Card */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-8">
            {success ? (
              // Success State
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Orchard Created Successfully!</h2>
                <p className="text-gray-600 mb-4">Redirecting to your new orchard...</p>
                <div className="animate-spin w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">What is a PMTiles file?</h3>
                  <p className="text-sm text-blue-800">
                    PMTiles is a format for storing map tiles in a single file. Your file should contain orthomosaic
                    imagery (aerial/satellite photos) of your orchard. The system will automatically extract geographic
                    bounds and zoom levels from the file.
                  </p>
                  <p className="text-sm text-blue-800 mt-2">
                    <strong>Recommended:</strong> Files under 500MB upload faster. Maximum file size is 2GB.
                  </p>
                </div>

                {/* Orchard Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                    Orchard Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={loading}
                    placeholder="e.g., Sunny Valley Apple Orchard"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This will be used to generate a unique identifier for your orchard
                  </p>
                </div>

                {/* Location */}
                <div>
                  <label htmlFor="location" className="block text-sm font-semibold text-gray-700 mb-2">
                    Location *
                  </label>
                  <input
                    type="text"
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                    disabled={loading}
                    placeholder="e.g., Washington State, USA"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Geographic location description (city, state, country)
                  </p>
                </div>

                {/* File Upload - Drag and Drop Zone */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    PMTiles File *
                  </label>

                  <div
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => !loading && fileInputRef.current?.click()}
                    className={`
                      relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
                      ${isDragging
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
                      }
                      ${loading ? 'cursor-not-allowed opacity-50' : ''}
                    `}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pmtiles"
                      onChange={handleFileSelect}
                      disabled={loading}
                      className="hidden"
                    />

                    {file ? (
                      // File Selected State
                      <div className="space-y-2">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <p className="font-medium text-gray-900">{file.name}</p>
                        <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                        {!loading && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFile(null);
                              if (fileInputRef.current) {
                                fileInputRef.current.value = '';
                              }
                            }}
                            className="text-sm text-red-600 hover:text-red-700 font-medium"
                          >
                            Remove file
                          </button>
                        )}
                      </div>
                    ) : (
                      // Empty State
                      <div className="space-y-2">
                        <svg className="w-12 h-12 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-gray-700 font-medium">
                          Drag and drop your .pmtiles file here
                        </p>
                        <p className="text-sm text-gray-500">or click to browse</p>
                        <p className="text-xs text-gray-400">Only .pmtiles files are accepted</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h4 className="text-sm font-semibold text-red-900">Upload Failed</h4>
                        <p className="text-sm text-red-800 mt-1">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading Progress */}
                {loading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      <p className="text-sm font-medium text-blue-900">
                        {uploadProgress < 100 ? 'Uploading and processing...' : 'Finalizing...'}
                      </p>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-blue-700 mt-2">
                      This may take a few moments for large files
                    </p>
                  </div>
                )}

                {/* Form Actions */}
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={loading}
                    className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !name || !location || !file}
                    className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                  >
                    {loading ? 'Creating Orchard...' : 'Create Orchard'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Help Text */}
          {!success && (
            <div className="mt-6 text-center text-sm text-gray-600">
              <p>Need help creating PMTiles? Check out the <a href="https://docs.protomaps.com/pmtiles/" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">PMTiles documentation</a></p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
