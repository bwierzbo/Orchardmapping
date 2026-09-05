import type { OrchardBoundary } from './types';
import { boundaryBounds } from './orchard-boundary';

export interface GridTree {
  row_id: string;
  position: number;
  lat: number;
  lng: number;
}

export interface GridPlan {
  trees: GridTree[];
  rows: number;
  positions: number;
  /** Centre-to-centre spacing in metres, for reporting */
  rowSpacingM: number;
  treeSpacingM: number;
  /** Which compass direction the rows run */
  rowAxis: 'north-south' | 'east-west';
}

const M_PER_DEG_LAT = 111_132;

function metresPerDegLng(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

/**
 * Lay a regular planting grid inside a boundary's bounding box.
 *
 * Rows run along the block's long axis (how an orchard is normally
 * driven), and are spaced evenly across the short axis. Both axes place
 * trees at cell centres, so the outermost trees sit half a spacing in
 * from the boundary rather than on it.
 *
 * This is a designed grid, not observed positions — it is what you plant
 * against when imagery cannot resolve individual trees. Positions are
 * exact and evenly spaced; nudge individual trees later once a drone
 * survey lands.
 */
export function generateTreeGrid(
  boundary: OrchardBoundary,
  rows: number,
  positions: number
): GridPlan {
  if (!Number.isInteger(rows) || rows < 1) throw new Error('rows must be a positive integer');
  if (!Number.isInteger(positions) || positions < 1) {
    throw new Error('positions must be a positive integer');
  }

  const { minLng, minLat, maxLng, maxLat } = boundaryBounds(boundary);
  const midLat = (minLat + maxLat) / 2;

  const widthM = (maxLng - minLng) * metresPerDegLng(midLat);
  const heightM = (maxLat - minLat) * M_PER_DEG_LAT;

  // Rows run the long way; they are spaced across the short way.
  const rowsRunNorthSouth = heightM >= widthM;

  const trees: GridTree[] = [];
  for (let r = 0; r < rows; r++) {
    const rowFrac = (r + 0.5) / rows;
    for (let p = 0; p < positions; p++) {
      const posFrac = (p + 0.5) / positions;
      const lng = rowsRunNorthSouth
        ? minLng + rowFrac * (maxLng - minLng)
        : minLng + posFrac * (maxLng - minLng);
      // Position 1 starts at the north end of a north-south row, and at
      // the west end of an east-west row.
      const lat = rowsRunNorthSouth
        ? maxLat - posFrac * (maxLat - minLat)
        : maxLat - rowFrac * (maxLat - minLat);
      trees.push({
        row_id: String(r + 1),
        position: p + 1,
        lat: Number(lat.toFixed(7)),
        lng: Number(lng.toFixed(7)),
      });
    }
  }

  return {
    trees,
    rows,
    positions,
    rowSpacingM: (rowsRunNorthSouth ? widthM : heightM) / rows,
    treeSpacingM: (rowsRunNorthSouth ? heightM : widthM) / positions,
    rowAxis: rowsRunNorthSouth ? 'north-south' : 'east-west',
  };
}
