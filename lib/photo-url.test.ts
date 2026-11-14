import { describe, expect, it } from 'vitest';
import { isOwnPhotoUrl } from './photo-url';

describe('isOwnPhotoUrl', () => {
  it("accepts a photo uploaded to this app's Blob store", () => {
    expect(isOwnPhotoUrl('https://abc123.public.blob.vercel-storage.com/photos/OBC-001-0001/1731600000000.jpg')).toBe(true);
  });

  it('refuses anything else: other hosts, other folders, plain http, junk', () => {
    const refused = [
      'https://example.com/photos/x.jpg',
      'https://evil.public.blob.vercel-storage.com.example.com/photos/x.jpg',
      'https://abc123.public.blob.vercel-storage.com/previews/x.jpg',
      'http://abc123.public.blob.vercel-storage.com/photos/x.jpg',
      'not a url',
    ];
    for (const url of refused) expect(isOwnPhotoUrl(url), url).toBe(false);
  });
});
