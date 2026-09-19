/**
 * Downscale a camera photo before upload.
 *
 * A modern phone shoots 4000×3000 at 3–5 MB. Nothing in this app displays a
 * tree photo larger than a few hundred pixels, so uploading the original
 * costs field-crew minutes on cellular, storage, and then the same bytes
 * again on every view. 1600 px on the long edge at q0.82 lands around
 * 200–400 KB — still more detail than any view uses, ~10× smaller.
 *
 * Falls back to the untouched file whenever the browser can't decode the
 * source (Safari on the desktop won't decode HEIC), so a resize failure
 * never costs the user the photo.
 */

export interface ResizeOptions {
  /** Longest edge of the output, in pixels. */
  maxEdge?: number;
  /** JPEG quality, 0–1. */
  quality?: number;
}

const DEFAULTS: Required<ResizeOptions> = { maxEdge: 1600, quality: 0.82 };

export async function downscaleImage(
  file: File,
  options: ResizeOptions = {},
): Promise<File> {
  const { maxEdge, quality } = { ...DEFAULTS, ...options };

  // Nothing to gain on small files
  if (file.size < 300_000) return file;

  try {
    // imageOrientation honours the EXIF rotation, so portrait photos don't
    // come out sideways once the EXIF block is dropped by re-encoding.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === 'image/jpeg') {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file; // undecodable (e.g. HEIC on desktop Safari) — send as-is
  }
}

/** Extensions /api/photos/upload will accept — anything else is sent as .jpg. */
const UPLOADABLE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic'];

/**
 * The extension to give an upload path. The upload route rejects any
 * pathname outside UPLOADABLE_EXTENSIONS, and downscaleImage may hand back
 * the untouched original (HEIC on desktop Safari), so the name is not
 * something callers can assume.
 */
export function photoExtension(file: File): string {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return UPLOADABLE_EXTENSIONS.includes(ext) ? ext : 'jpg';
}
