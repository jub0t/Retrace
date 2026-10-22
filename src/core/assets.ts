// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { strokesBounds } from './geometry';
import { uid, type Point, type Stroke } from './model';

/**
 * A reusable drawing: strokes saved with their recorded motion, normalized so the
 * top-left of their bounds sits at (0, 0). Assets are plain JSON files, so the editor
 * library, the MCP server and people sharing files all use the same format.
 */
export interface Asset {
  type: 'retrace/asset';
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  strokes: Stroke[];
  createdAt: string;
}

/** What copy/paste puts on the system clipboard. */
export interface StrokeClipboard {
  type: 'retrace/strokes';
  version: 1;
  strokes: Stroke[];
}

export const ASSET_EXTENSION = '.retrace-asset.json';

/** Map every point (and optionally scale the nib) without touching timing or pressure. */
export function transformStrokes(strokes: Stroke[], map: (x: number, y: number) => [number, number], sizeScale = 1): Stroke[] {
  return strokes.map((s) => ({
    ...s,
    ...(s.gradient?.box && { gradient: { ...s.gradient, box: mapBox(s.gradient.box, map) } }),
    size: round(s.size * sizeScale),
    points: s.points.map(([x, y, p, t]): Point => {
      const [nx, ny] = map(x, y);
      return [round(nx), round(ny), p, t];
    }),
  }));
}

function mapBox(box: { x: number; y: number; width: number; height: number }, map: (x: number, y: number) => [number, number]) {
  const [x1, y1] = map(box.x, box.y);
  const [x2, y2] = map(box.x + box.width, box.y + box.height);
  return { x: round(Math.min(x1, x2)), y: round(Math.min(y1, y2)), width: round(Math.abs(x2 - x1)), height: round(Math.abs(y2 - y1)) };
}

/** Copies with fresh ids, so pasted or placed strokes never collide with existing ones. */
export function withNewIds(strokes: Stroke[]): Stroke[] {
  return strokes.map((s) => ({ ...s, id: uid() }));
}

export function createAsset(name: string, strokes: Stroke[]): Asset {
  const b = strokesBounds(strokes);
  if (!b) throw new Error('An object needs at least one stroke');
  return {
    type: 'retrace/asset',
    version: 1,
    id: uid(),
    name: name.trim() || 'Untitled',
    width: b.width,
    height: b.height,
    strokes: transformStrokes(strokes, (x, y) => [x - b.x, y - b.y]),
    createdAt: new Date().toISOString(),
  };
}

/** Strokes for one copy of the asset, centered on (x, y) and scaled. */
export function placeAsset(asset: Asset, x: number, y: number, scale = 1): Stroke[] {
  const ox = x - (asset.width * scale) / 2;
  const oy = y - (asset.height * scale) / 2;
  return withNewIds(transformStrokes(asset.strokes, (px, py) => [ox + px * scale, oy + py * scale], scale));
}

export function parseAsset(data: unknown): Asset {
  const a = data as Partial<Asset> | null;
  if (!a || a.type !== 'retrace/asset' || !Array.isArray(a.strokes) || !a.strokes.length) {
    throw new Error('Not a Retrace object (expected type "retrace/asset" with strokes)');
  }
  return { ...a, id: a.id ?? uid(), name: a.name ?? 'Untitled' } as Asset;
}

/** Accepts one asset, an array of them, or a library export ({ assets: [...] }). */
export function parseAssets(data: unknown): Asset[] {
  if (Array.isArray(data)) return data.map(parseAsset);
  const lib = data as { assets?: unknown[] } | null;
  if (lib && Array.isArray(lib.assets)) return lib.assets.map(parseAsset);
  return [parseAsset(data)];
}

export function strokeClipboard(strokes: Stroke[]): string {
  const data: StrokeClipboard = { type: 'retrace/strokes', version: 1, strokes };
  return JSON.stringify(data);
}

/** Recognize Retrace data in pasted text; anything else returns null. */
export function parseClipboard(text: string): StrokeClipboard | Asset | null {
  if (!text.trimStart().startsWith('{')) return null;
  try {
    const data = JSON.parse(text);
    if (data?.type === 'retrace/strokes' && Array.isArray(data.strokes)) return data as StrokeClipboard;
    if (data?.type === 'retrace/asset') return parseAsset(data);
  } catch {
    // Not JSON, or not ours.
  }
  return null;
}

const round = (n: number) => Math.round(n * 100) / 100;
