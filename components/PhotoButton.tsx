'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
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
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : 'jpg';
      const blob = await upload(`photos/${treeId}/${Date.now()}.${safeExt}`, file, {
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
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
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
