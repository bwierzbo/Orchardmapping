import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * Every page under /orchard/[id] must prove membership itself.
 *
 * The layout gate is not enough: a layout and its page render in
 * parallel, so notFound() in the layout shows a 404 while the page has
 * already fetched and serialised the orchard's data. That is how
 * /orchard/<id> came to answer an anonymous request with all 480 of an
 * orchard's tree ids.
 *
 * This is the check the layout's own comment wished for — "the failure
 * mode of per-page checks is the page someone forgets" — turned into
 * something that fails the build instead of leaking.
 */
const ROOT = path.join(__dirname, '..', 'app', 'orchard', '[id]');

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return entry === 'page.tsx' ? [full] : [];
  });
}

describe('orchard pages', () => {
  const pages = pageFiles(ROOT);

  it('finds the pages to check', () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  it.each(pages.map((p) => [path.relative(ROOT, p), p]))(
    '%s proves membership before fetching',
    (_label, file) => {
      const src = readFileSync(file, 'utf-8');
      expect(src).toContain('requireOrchardPage(id)');
    }
  );

  it.each(pages.map((p) => [path.relative(ROOT, p), p]))(
    '%s guards every entry point that takes an orchard id',
    (_label, file) => {
      const src = readFileSync(file, 'utf-8');
      // generateMetadata is a data fetch too — a title leaks a name.
      const entryPoints = (src.match(/const \{[^}]*\bid\b[^}]*\} = await params;/g) ?? []).length;
      const guards = (src.match(/requireOrchardPage\(id\)/g) ?? []).length;
      expect(guards).toBeGreaterThanOrEqual(entryPoints);
    }
  );
});
