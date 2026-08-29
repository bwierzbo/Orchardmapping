import { put, del, list } from '@vercel/blob';

export interface BlobUploadResult {
  url: string;
  pathname: string;
  contentType: string;
}

/**
 * Upload a PMTiles file to Vercel Blob storage
 */
export async function uploadPMTilesToBlob(
  orchardId: string,
  file: Buffer | Blob,
  filename: string,
  type: 'ortho' | 'vector',
  options?: { multipart?: boolean }
): Promise<BlobUploadResult> {
  const pathname = `orchards/${orchardId}/${type}/${filename}`;

  const blob = await put(pathname, file, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/vnd.pmtiles',
    // Required for reliable >100MB uploads
    multipart: options?.multipart ?? false,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType || 'application/octet-stream',
  };
}

/**
 * Upload a preview image to Vercel Blob storage
 */
export async function uploadPreviewImageToBlob(
  orchardId: string,
  file: Buffer | Blob,
  filename: string
): Promise<BlobUploadResult> {
  const pathname = `orchards/${orchardId}/preview/${filename}`;

  const blob = await put(pathname, file, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType || 'image/jpeg',
  };
}

/**
 * Delete all blobs for an orchard
 */
export async function deleteOrchardBlobs(orchardId: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `orchards/${orchardId}/`, cursor });
    if (page.blobs.length > 0) {
      await del(page.blobs.map((b) => b.url));
    }
    cursor = page.cursor;
  } while (cursor);
}

/**
 * List all blobs for an orchard
 */
export async function listOrchardBlobs(orchardId: string) {
  return list({ prefix: `orchards/${orchardId}/` });
}
