// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

/** Hue 0..360, saturation and value 0..1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

/** `hue` is kept when the color has none (grays), so the hue slider doesn't jump. */
export function hexToHsv(hex: string, hue = 0): Hsv {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = hue;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

/** Accepts #rgb, #rrggbb (with or without #). Returns null for anything else. */
export function parseHex(input: string): [number, number, number] | null {
  let hex = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function normalizeHex(input: string): string | null {
  const rgb = parseHex(input);
  return rgb ? '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('') : null;
}

/** Color at `t` (0..1) between sorted stops, for adding a stop that doesn't change the look. */
export function colorAt(stops: { offset: number; color: string }[], t: number): string {
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  if (t <= sorted[0].offset) return sorted[0].color;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (t <= b.offset) {
      const u = (t - a.offset) / (b.offset - a.offset || 1);
      const [ca, cb] = [parseHex(a.color) ?? [0, 0, 0], parseHex(b.color) ?? [0, 0, 0]];
      return '#' + ca.map((c, k) => Math.round(c + (cb[k] - c) * u).toString(16).padStart(2, '0')).join('');
    }
  }
  return sorted[sorted.length - 1].color;
}
