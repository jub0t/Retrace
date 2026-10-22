import { getStroke } from 'perfect-freehand';
import { brushOf } from './brushes';
import type { Point, Stroke } from './model';

/**
 * Turns stroke centerline points into a filled marker outline as an SVG path string.
 * The same string feeds canvas (via Path2D), SVG export and the headless PNG preview,
 * so every output looks identical.
 */
export function strokeOutlinePath(stroke: Stroke, points: Point[] = stroke.points, complete = true): string {
  const outline = getStroke(points, {
    ...brushOf(stroke.brush).outline,
    size: stroke.size,
    simulatePressure: stroke.simulatePressure,
    last: complete,
  });
  return svgPathFromOutline(outline);
}

// From the perfect-freehand README: quadratic curves through outline midpoints.
function svgPathFromOutline(points: number[][]): string {
  if (!points.length) return '';
  const d: (string | number)[] = ['M', round(points[0][0]), round(points[0][1]), 'Q'];
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    d.push(round(x0), round(y0), round((x0 + x1) / 2), round((y0 + y1) / 2));
  }
  d.push('Z');
  return d.join(' ');
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Points of the stroke drawn by `elapsed` ms into it (in recorded time). */
export function pointsAt(stroke: Stroke, elapsed: number): Point[] {
  const pts = stroke.points;
  let i = 0;
  while (i < pts.length && pts[i][3] <= elapsed) i++;
  return pts.slice(0, Math.max(i, 1));
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function strokesBounds(strokes: Stroke[]): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    const r = s.size / 2;
    for (const [x, y] of s.points) {
      minX = Math.min(minX, x - r);
      minY = Math.min(minY, y - r);
      maxX = Math.max(maxX, x + r);
      maxY = Math.max(maxY, y + r);
    }
  }
  if (minX === Infinity) return null;
  return { x: Math.round(minX), y: Math.round(minY), width: Math.round(maxX - minX), height: Math.round(maxY - minY) };
}

/** Distance from (x, y) to the nearest centerline point of the stroke. */
export function distanceToStroke(stroke: Stroke, x: number, y: number): number {
  let best = Infinity;
  const pts = stroke.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    best = Math.min(best, distanceToSegment(x, y, a[0], a[1], b[0], b[1]));
  }
  return best;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
