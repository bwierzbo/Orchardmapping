import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Leaving the map (to the dashboard, say) unmounts the viewer, and React
 * runs effect cleanups in the order they were declared. The effect that
 * creates the map is declared first, so map.remove() has already run --
 * clearing map.style -- by the time a layer hook cleans up. A cleanup that
 * then calls map.getLayer() throws "Cannot read properties of undefined
 * (reading 'getLayer')" and the page falls into the error screen. useLasso
 * shipped without the guard every other layer hook had, and did exactly that.
 *
 * Read from the source rather than rendered: the bug is one missing line in
 * a cleanup, and this finds the next one before it ships.
 */
const VIEWER = path.join(__dirname, '..', 'app', 'orchard', '[id]', 'viewer');
const STYLE_CALLS =
  /\b(?:map|m)\.(getLayer|getSource|removeLayer|removeSource|setFeatureState|removeFeatureState|setPaintProperty|setLayoutProperty|setFilter)\(/;

function unguardedCleanups(file: string, source: string): string[] {
  const found: string[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/return \(\) => \{\s*$/.test(lines[i])) continue;
    const indent = lines[i].match(/^\s*/)![0];
    let guarded = false;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.startsWith(`${indent}};`)) break;
      if (/\b(?:map|m)\.style\b/.test(line)) guarded = true;
      if (STYLE_CALLS.test(line) && !guarded) {
        found.push(`${file}:${j + 1}: ${line.trim()}`);
      }
    }
  }
  return found;
}

describe('map layer cleanups', () => {
  it('check map.style before touching layers, since the map may already be removed', () => {
    const files = readdirSync(VIEWER).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'));
    const problems = files.flatMap((f) =>
      unguardedCleanups(f, readFileSync(path.join(VIEWER, f), 'utf8'))
    );
    console.log(`checked ${files.length} viewer files; unguarded:`, problems);
    expect(problems).toEqual([]);
  });

  it('notices a cleanup that is missing the guard', () => {
    const bad = [
      '  useEffect(() => {',
      '    return () => {',
      "      if (map.getLayer('x')) map.removeLayer('x');",
      '    };',
      '  }, []);',
    ].join('\n');
    expect(unguardedCleanups('bad.ts', bad)).toHaveLength(1);
    const good = bad.replace('return () => {', 'return () => {\n      if (!map.style) return;');
    expect(unguardedCleanups('good.ts', good)).toEqual([]);
  });
});
