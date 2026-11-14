/**
 * A photo URL this app made: uploaded through /api/photos/upload to its own
 * Blob store. Anything else is refused before it is stored on a record or
 * handed to another service.
 */
export function isOwnPhotoUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      u.hostname.endsWith('.public.blob.vercel-storage.com') &&
      u.pathname.startsWith('/photos/')
    );
  } catch {
    return false;
  }
}
