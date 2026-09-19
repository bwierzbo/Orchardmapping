'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { downscaleImage, photoExtension } from '@/lib/image-resize';
import { Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Camera button: opens the phone camera (or file picker on desktop),
 * uploads the image browser→Blob via /api/photos/upload, and hands the
 * resulting URL to the caller to attach to a tree event.
 */
export default function PhotoButton({
  treeId,
  onUploaded,
  className,
  label,
}: {
  treeId: string;
  onUploaded: (url: string) => void;
  className?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      // Shrink before upload — the field crew is usually on cellular
      file = await downscaleImage(file);
      const blob = await upload(`photos/${treeId}/${Date.now()}.${photoExtension(file)}`, file, {
        access: 'public',
        handleUploadUrl: '/api/photos/upload',
      });
      onUploaded(blob.url);
    } catch (error) {
      console.error('Photo upload failed:', error);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      {/* No `capture` attr: the chooser lets users shoot Portrait-mode
          photos in the native Camera app and pick them from the library. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Take photo"
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-paper text-ink hover:bg-canopy-50 active:scale-[0.97] disabled:opacity-50',
          className
        )}
      >
        {uploading ? (
          <Loader2 size={18} aria-hidden className="animate-spin" />
        ) : (
          <Camera size={18} aria-hidden />
        )}
        {label && <span className="text-sm font-medium">{uploading ? 'Uploading…' : label}</span>}
      </button>
    </>
  );
}
