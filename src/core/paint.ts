// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { strokesBounds, type Bounds } from './geometry';
import type { Gradient, GradientStop, Stroke } from './model';

export type GradientGeometry =
  | { type: 'linear'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'radial'; cx: number; cy: number; r: number };

/** Where a gradient lies over a box. Canvas, SVG and previews all use this, so they match. */
export function gradientGeometry(g: Gradient, b: Bounds): GradientGeometry {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  if (g.type === 'radial') return { type: 'radial', cx, cy, r: Math.max(1, Math.max(b.width, b.height) / 2) };
  const a = ((g.angle ?? 0) * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const half = Math.max(1, (Math.abs(b.width * dx) + Math.abs(b.height * dy)) / 2);
  return { type: 'linear', x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half };
}

export function sortedStops(g: Gradient): GradientStop[] {
  return g.stops.map((s) => ({ ...s, offset: Math.min(1, Math.max(0, s.offset)) })).sort((a, b) => a.offset - b.offset);
}

/** CSS for UI previews. CSS angles start at "to top", ours at "to the right". */
export function gradientCss(g: Gradient, forceLinear = false): string {
  const stops = sortedStops(g).map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
  return g.type === 'radial' && !forceLinear ? `radial-gradient(circle, ${stops})` : `linear-gradient(${forceLinear ? 90 : g.angle + 90}deg, ${stops})`;
}

/** The box a stroke's gradient is laid over. */
export function gradientBox(stroke: Stroke): Bounds | null {
  return stroke.gradient?.box ?? strokesBounds([stroke]);
}

/** Give strokes one shared gradient box (their combined bounds), so the colors flow across them. */
export function shareGradientBox(strokes: Stroke[]): Stroke[] {
  const box = strokesBounds(strokes);
  if (!box) return strokes;
  return strokes.map((s) => (s.gradient ? { ...s, gradient: { ...s.gradient, box } } : s));
}

/** SVG paint for a stroke: a `fill` value plus the <defs> entry it needs (if any). */
export function svgPaint(stroke: Stroke, id: string): { fill: string; def: string } {
  const b = stroke.gradient && gradientBox(stroke);
  if (!stroke.gradient || !b) return { fill: stroke.color, def: '' };
  const geo = gradientGeometry(stroke.gradient, b);
  const stops = sortedStops(stroke.gradient).map((s) => `<stop offset="${r(s.offset)}" stop-color="${s.color}"/>`).join('');
  const def =
    geo.type === 'linear'
      ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r(geo.x1)}" y1="${r(geo.y1)}" x2="${r(geo.x2)}" y2="${r(geo.y2)}">${stops}</linearGradient>`
      : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r(geo.cx)}" cy="${r(geo.cy)}" r="${r(geo.r)}">${stops}</radialGradient>`;
  return { fill: `url(#${id})`, def };
}

const r = (n: number) => String(Math.round(n * 100) / 100);
