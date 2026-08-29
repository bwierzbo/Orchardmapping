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
  type: 'ortho' | 'vector'
): Promise<BlobUploadResult> {
  const pathname = `orchards/${orchardId}/${type}/${filename}`;

  const blob = await put(pathname, file, {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/octet-stream',
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
  const { blobs } = await list({ prefix: `orchards/${orchardId}/` });

  for (const blob of blobs) {
    await del(blob.url);
  }
}

/**
 * List all blobs for an orchard
 */
export async function listOrchardBlobs(orchardId: string) {
  return list({ prefix: `orchards/${orchardId}/` });
}
