// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import type { StrokeOptions } from 'perfect-freehand';

export const BRUSH_STYLES = ['marker', 'pen', 'pencil', 'brush', 'highlighter'] as const;
export type BrushStyle = (typeof BRUSH_STYLES)[number];

export interface Brush {
  label: string;
  description: string;
  /** Outline shape: how width follows pressure/velocity, smoothing, end tapers. */
  outline: Omit<StrokeOptions, 'size' | 'simulatePressure' | 'last'>;
  opacity: number;
  /** A comfortable starting size in project pixels. */
  defaultSize: number;
}

export const BRUSHES: Record<BrushStyle, Brush> = {
  marker: {
    label: 'Marker',
    description: 'Even, slightly wobbly felt-tip. The classic explainer look.',
    outline: { thinning: 0.3, smoothing: 0.6, streamline: 0.45 },
    opacity: 1,
    defaultSize: 7,
  },
  pen: {
    label: 'Ink pen',
    description: 'Pressure-sensitive line with tapered ends.',
    outline: {
      thinning: 0.65,
      smoothing: 0.55,
      streamline: 0.4,
      start: { taper: 18, cap: true },
      end: { taper: 24, cap: true },
    },
    opacity: 1,
    defaultSize: 5,
  },
  pencil: {
    label: 'Pencil',
    description: 'Thin, light graphite for sketches and notes.',
    outline: { thinning: 0.15, smoothing: 0.4, streamline: 0.3, start: { taper: 6 }, end: { taper: 6 } },
    opacity: 0.72,
    defaultSize: 3,
  },
  brush: {
    label: 'Brush',
    description: 'Bold calligraphic swell with long tapers.',
    outline: {
      thinning: 0.85,
      smoothing: 0.7,
      streamline: 0.55,
      easing: (t) => Math.sin((t * Math.PI) / 2),
      start: { taper: 40, cap: true },
      end: { taper: 60, cap: true },
    },
    opacity: 1,
    defaultSize: 12,
  },
  highlighter: {
    label: 'Highlighter',
    description: 'Wide translucent stroke for emphasis.',
    outline: { thinning: 0, smoothing: 0.6, streamline: 0.6 },
    opacity: 0.35,
    defaultSize: 24,
  },
};

export function brushOf(style: BrushStyle | undefined): Brush {
  return BRUSHES[style ?? 'marker'] ?? BRUSHES.marker;
}
