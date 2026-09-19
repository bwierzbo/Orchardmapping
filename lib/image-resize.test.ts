import { describe, it, expect } from 'vitest';
import { photoExtension } from './image-resize';

/**
 * photoExtension guards the one thing /api/photos/upload rejects outright:
 * a pathname whose extension isn't in its whitelist. downscaleImage hands
 * back the untouched original whenever the browser can't decode it, so the
 * name reaching this function is whatever the camera or picker produced.
 */
const file = (name: string, type = 'image/jpeg') =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

describe('photoExtension', () => {
  it('keeps every extension the upload route accepts', () => {
    expect(photoExtension(file('a.jpg'))).toBe('jpg');
    expect(photoExtension(file('a.jpeg'))).toBe('jpeg');
    expect(photoExtension(file('a.png', 'image/png'))).toBe('png');
    expect(photoExtension(file('a.webp', 'image/webp'))).toBe('webp');
    expect(photoExtension(file('a.heic', 'image/heic'))).toBe('heic');
  });

  it('lowercases what the camera shouts', () => {
    expect(photoExtension(file('IMG_0431.JPG'))).toBe('jpg');
    expect(photoExtension(file('IMG_0431.HEIC', 'image/heic'))).toBe('heic');
  });

  it('falls back to jpg for extensions the route would reject', () => {
    expect(photoExtension(file('scan.tiff'))).toBe('jpg');
    expect(photoExtension(file('clip.gif'))).toBe('jpg');
  });

  it('falls back to jpg when there is no extension at all', () => {
    expect(photoExtension(file('photo'))).toBe('jpg');
    expect(photoExtension(file(''))).toBe('jpg');
  });

  it('reads only the last segment of a dotted name', () => {
    expect(photoExtension(file('row 4.north end.png', 'image/png'))).toBe('png');
  });
});
