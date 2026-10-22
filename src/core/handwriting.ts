// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import type { Vec } from './humanize';

/**
 * A single-stroke handwriting alphabet for hand-lettered text. Glyphs live on a grid
 * where the cap height is 1 (y = 0 at the top, 1 on the baseline). Each glyph is a list
 * of pen strokes in the order a person writes them; each stroke is a list of parts
 * joined at corners, and a part is either straight segments or a smooth curve.
 */
interface Part {
  pts: Vec[];
  smooth?: boolean;
}
type GlyphStroke = Part[];
interface Glyph {
  width: number;
  strokes: GlyphStroke[];
}

const line = (...pts: Vec[]): GlyphStroke => [{ pts }];
const curve = (...pts: Vec[]): GlyphStroke => [{ pts, smooth: true }];
const dot = (x: number, y: number): GlyphStroke => [{ pts: [[x, y]] }];
const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number): Vec[] => {
  const n = 18;
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Vec;
  });
};
// Counter-clockwise from the top, overshooting a little like a real "O".
const oval = (cx: number, rx: number): GlyphStroke => [{ pts: arc(cx, 0.5, rx, 0.5, -80, -80 - 375), smooth: true }];

const GLYPHS: Record<string, Glyph> = {
  A: { width: 0.7, strokes: [line([0, 1], [0.35, 0], [0.7, 1]), line([0.16, 0.62], [0.54, 0.62])] },
  B: {
    width: 0.58,
    strokes: [
      line([0, 0], [0, 1]),
      [
        { pts: [[0, 0], [0.38, 0.02], [0.52, 0.24], [0.36, 0.47], [0.02, 0.49]], smooth: true },
        { pts: [[0.02, 0.49], [0.42, 0.52], [0.58, 0.76], [0.4, 0.98], [0, 1]], smooth: true },
      ],
    ],
  },
  C: { width: 0.62, strokes: [[{ pts: arc(0.36, 0.5, 0.36, 0.5, -40, -320), smooth: true }]] },
  D: { width: 0.62, strokes: [line([0, 0], [0, 1]), curve([0, 0], [0.38, 0.05], [0.62, 0.5], [0.38, 0.95], [0, 1])] },
  E: { width: 0.55, strokes: [line([0.55, 0], [0, 0], [0, 1], [0.55, 1]), line([0, 0.5], [0.42, 0.5])] },
  F: { width: 0.55, strokes: [line([0.55, 0], [0, 0], [0, 1]), line([0, 0.5], [0.42, 0.5])] },
  G: {
    width: 0.66,
    strokes: [[{ pts: [[0.6, 0.16], [0.36, 0], [0.04, 0.3], [0.08, 0.78], [0.36, 1], [0.62, 0.84], [0.63, 0.6]], smooth: true }, { pts: [[0.63, 0.6], [0.38, 0.6]] }]],
  },
  H: { width: 0.62, strokes: [line([0, 0], [0, 1]), line([0.62, 0], [0.62, 1]), line([0, 0.5], [0.62, 0.5])] },
  I: { width: 0.12, strokes: [line([0.06, 0], [0.06, 1])] },
  J: { width: 0.5, strokes: [curve([0.5, 0], [0.5, 0.72], [0.28, 1], [0.02, 0.82])] },
  K: { width: 0.58, strokes: [line([0, 0], [0, 1]), line([0.56, 0], [0.02, 0.58]), line([0.2, 0.4], [0.6, 1])] },
  L: { width: 0.5, strokes: [line([0, 0], [0, 1], [0.5, 1])] },
  M: { width: 0.78, strokes: [line([0, 1], [0, 0], [0.39, 0.62], [0.78, 0], [0.78, 1])] },
  N: { width: 0.62, strokes: [line([0, 1], [0, 0], [0.62, 1], [0.62, 0])] },
  O: { width: 0.72, strokes: [oval(0.36, 0.36)] },
  P: { width: 0.55, strokes: [line([0, 1], [0, 0]), curve([0, 0], [0.4, 0.02], [0.56, 0.25], [0.4, 0.48], [0.02, 0.52])] },
  Q: { width: 0.72, strokes: [oval(0.36, 0.36), line([0.42, 0.68], [0.76, 1.06])] },
  R: {
    width: 0.58,
    strokes: [line([0, 1], [0, 0]), [{ pts: [[0, 0], [0.4, 0.02], [0.56, 0.25], [0.4, 0.48], [0.04, 0.52]], smooth: true }, { pts: [[0.04, 0.52], [0.58, 1]] }]],
  },
  S: { width: 0.56, strokes: [curve([0.54, 0.12], [0.3, 0], [0.05, 0.2], [0.28, 0.47], [0.54, 0.72], [0.3, 1], [0, 0.86])] },
  T: { width: 0.62, strokes: [line([0, 0], [0.62, 0]), line([0.31, 0], [0.31, 1])] },
  U: { width: 0.62, strokes: [curve([0, 0], [0, 0.68], [0.31, 1], [0.62, 0.68], [0.62, 0])] },
  V: { width: 0.66, strokes: [line([0, 0], [0.33, 1], [0.66, 0])] },
  W: { width: 0.92, strokes: [line([0, 0], [0.22, 1], [0.46, 0.32], [0.7, 1], [0.92, 0])] },
  X: { width: 0.6, strokes: [line([0, 0], [0.6, 1]), line([0.6, 0], [0, 1])] },
  Y: { width: 0.62, strokes: [line([0, 0], [0.31, 0.52], [0.62, 0]), line([0.31, 0.52], [0.31, 1])] },
  Z: { width: 0.6, strokes: [line([0, 0], [0.6, 0], [0, 1], [0.6, 1])] },
  '0': { width: 0.54, strokes: [oval(0.27, 0.27)] },
  '1': { width: 0.36, strokes: [line([0.02, 0.22], [0.24, 0], [0.24, 1])] },
  '2': { width: 0.56, strokes: [[{ pts: [[0.04, 0.22], [0.28, 0], [0.54, 0.2], [0.42, 0.52], [0, 1]], smooth: true }, { pts: [[0, 1], [0.58, 1]] }]] },
  '3': {
    width: 0.54,
    strokes: [[{ pts: [[0.04, 0.12], [0.3, 0], [0.52, 0.22], [0.26, 0.47]], smooth: true }, { pts: [[0.26, 0.47], [0.56, 0.7], [0.32, 1], [0, 0.9]], smooth: true }]],
  },
  '4': { width: 0.6, strokes: [line([0.46, 1], [0.46, 0], [0, 0.66], [0.6, 0.66])] },
  '5': { width: 0.56, strokes: [[{ pts: [[0.54, 0], [0.08, 0], [0.04, 0.46]] }, { pts: [[0.04, 0.46], [0.32, 0.38], [0.56, 0.66], [0.34, 1], [0, 0.9]], smooth: true }]] },
  '6': { width: 0.56, strokes: [curve([0.48, 0], [0.14, 0.34], [0.04, 0.72], [0.3, 1], [0.56, 0.76], [0.3, 0.5], [0.06, 0.66])] },
  '7': { width: 0.56, strokes: [line([0, 0], [0.56, 0], [0.18, 1])] },
  '8': { width: 0.56, strokes: [curve([0.3, 0.48], [0.06, 0.24], [0.28, 0], [0.52, 0.22], [0.28, 0.5], [0.02, 0.76], [0.28, 1], [0.56, 0.76], [0.32, 0.5])] },
  '9': { width: 0.56, strokes: [curve([0.52, 0.32], [0.28, 0.5], [0.04, 0.28], [0.3, 0], [0.54, 0.24], [0.5, 0.62], [0.38, 1])] },
  '?': { width: 0.5, strokes: [curve([0, 0.2], [0.24, 0], [0.5, 0.18], [0.26, 0.48], [0.25, 0.7]), dot(0.25, 0.94)] },
  '!': { width: 0.16, strokes: [line([0.09, 0], [0.07, 0.7]), dot(0.07, 0.94)] },
  '.': { width: 0.14, strokes: [dot(0.07, 0.95)] },
  ',': { width: 0.16, strokes: [line([0.1, 0.86], [0.04, 1.12])] },
  "'": { width: 0.12, strokes: [line([0.07, 0], [0.05, 0.26])] },
  '-': { width: 0.42, strokes: [line([0, 0.55], [0.42, 0.53])] },
  ':': { width: 0.14, strokes: [dot(0.07, 0.35), dot(0.07, 0.92)] },
  '+': { width: 0.56, strokes: [line([0.28, 0.24], [0.28, 0.82]), line([0, 0.53], [0.56, 0.53])] },
  '=': { width: 0.56, strokes: [line([0, 0.38], [0.56, 0.38]), line([0, 0.68], [0.56, 0.68])] },
  '/': { width: 0.44, strokes: [line([0.44, -0.04], [0, 1.04])] },
};

export const HANDWRITING_CHARS = Object.keys(GLYPHS).join('') + ' ';

const LETTER_GAP = 0.2;
const SPACE = 0.42;

export function measureText(text: string, size: number): number {
  let w = 0;
  for (const ch of text.toUpperCase()) w += (GLYPHS[ch]?.width ?? SPACE) + LETTER_GAP;
  return Math.max(0, w - LETTER_GAP) * size;
}

/**
 * Pen paths for hand-lettered text. (x, y) is the top-left of the first capital and
 * `size` the cap height in px. Lowercase is written as capitals; unknown characters
 * become spaces. Every letter gets its own small tilt, scale and baseline drift.
 */
export function textPenPaths(text: string, x: number, y: number, size: number, rand: () => number, wobble = 1): Vec[][][] {
  const paths: Vec[][][] = [];
  let cursor = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch];
    if (!glyph) {
      cursor += (SPACE + LETTER_GAP) * size;
      continue;
    }
    const tilt = (rand() - 0.5) * 0.09 * wobble;
    const scale = size * (1 + (rand() - 0.5) * 0.08 * wobble);
    const dy = (rand() - 0.5) * 0.06 * size * wobble;
    const cx = (glyph.width * scale) / 2;
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    const place = ([gx, gy]: Vec): Vec => {
      const px = gx * scale - cx, py = gy * scale - scale / 2;
      return [cursor + cx + px * cos - py * sin, y + dy + scale / 2 + px * sin + py * cos];
    };
    for (const stroke of glyph.strokes) {
      paths.push(stroke.map((part) => (part.smooth ? smoothPart(part.pts.map(place)) : part.pts.map(place))));
    }
    cursor += (glyph.width + LETTER_GAP) * size;
  }
  return paths;
}

/** Catmull-Rom through the points, sampled densely enough for the humanizer. */
function smoothPart(points: Vec[]): Vec[] {
  if (points.length < 3) return points;
  const get = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  const out: Vec[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)];
    const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
