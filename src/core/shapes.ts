// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import type { BrushStyle } from './brushes';
import { measureText, textPenPaths } from './handwriting';
import { humanizePath, type Vec } from './humanize';
import { shareGradientBox } from './paint';
import { PALETTE, SIZES, uid, type Gradient, type Stroke } from './model';

/**
 * High-level shapes for programmatic drawing (scripts, AI agents). Each shape becomes
 * one or more strokes, drawn in the order a person would draw them.
 * Coordinates are project pixels, origin top-left.
 */
export type Shape = ShapeStyle &
  (
    | { type: 'line'; from: Vec; to: Vec }
    | { type: 'arrow'; from: Vec; to: Vec; /** -1..1, curves the shaft sideways. */ bend?: number }
    | { type: 'polyline'; points: Vec[]; closed?: boolean }
    | { type: 'curve'; points: Vec[]; closed?: boolean }
    | { type: 'ellipse'; center: Vec; rx: number; ry?: number }
    | {
        type: 'arc';
        center: Vec;
        rx: number;
        ry?: number;
        /** Degrees; 0 points right and angles turn clockwise (screen y points down). */
        from: number;
        to: number;
      }
    | {
        type: 'wave';
        /** The wave runs along the line from `from` to `to`, wiggling to either side of it. */
        from: Vec;
        to: Vec;
        amplitude: number;
        wavelength: number;
        /** Degrees; 180 flips the wave upside down. */
        phase?: number;
      }
    | { type: 'rect'; x: number; y: number; width: number; height: number }
    | {
        type: 'text';
        text: string;
        /** Top-left of the first capital. */
        x: number;
        y: number;
        /** Cap height in px (default 60). The nib defaults to about a tenth of it. */
        height?: number;
        align?: 'left' | 'center' | 'right';
      }
    | {
        type: 'stick_figure';
        /** Where the feet touch the ground. */
        x: number;
        y: number;
        height?: number;
        pose?: Pose;
        face?: Face;
        hair?: Hair;
        facing?: 'left' | 'right';
      }
  );

export interface ShapeStyle {
  color?: string;
  gradient?: Gradient;
  size?: number;
  brush?: BrushStyle;
  /** Fill closed shapes (ellipse, rect, closed polyline/curve) with an opaque color. */
  fill?: string;
  /** Stacking order: higher layers paint on top of lower ones, whenever they're drawn. */
  layer?: number;
}

export const POSES = ['stand', 'wave', 'cheer', 'point', 'think', 'shrug', 'sit'] as const;
export const FACES = ['happy', 'neutral', 'sad', 'surprised', 'none'] as const;
export const HAIRS = ['none', 'messy', 'spiky', 'long'] as const;
export type Pose = (typeof POSES)[number];
export type Face = (typeof FACES)[number];
export type Hair = (typeof HAIRS)[number];

export interface DrawContext {
  rand: () => number;
  wobble?: number;
  speed?: number;
  color?: string;
  gradient?: Gradient;
  size?: number;
  brush?: BrushStyle;
}

/** A stroke as ideal geometry: segments of one continuous pen movement. */
type PenPath = Vec[][];

export function shapeToStrokes(shape: Shape, ctx: DrawContext): Stroke[] {
  const color = shape.color ?? ctx.color ?? PALETTE[0];
  const textNib = shape.type === 'text' ? Math.max(3, (shape.height ?? 60) / 10) : undefined;
  const size = shape.size ?? textNib ?? ctx.size ?? SIZES.medium;
  const brush = shape.brush ?? ctx.brush;
  const gradient = shape.gradient ?? (shape.color ? undefined : ctx.gradient);
  const wobble = ctx.wobble ?? 1;
  const fill = shape.fill && isClosed(shape) ? shape.fill : undefined;
  const strokes = penPaths(shape, ctx.rand, wobble).map((segments, i) => ({
    id: uid(),
    color,
    size,
    ...(brush && brush !== 'marker' ? { brush } : {}),
    ...(gradient ? { gradient, color: gradient.stops[0]?.color ?? color } : {}),
    simulatePressure: true,
    points: humanizePath(segments, { rand: ctx.rand, wobble, speed: ctx.speed }),
    ...(fill && i === 0 ? { fill } : {}),
    ...(shape.layer ? { layer: shape.layer } : {}),
  }));
  return gradient ? shareGradientBox(strokes) : strokes;
}

function isClosed(shape: Shape): boolean {
  return shape.type === 'ellipse' || shape.type === 'rect' || ((shape.type === 'polyline' || shape.type === 'curve') && !!shape.closed);
}

/** The same shape moved by (dx, dy): for repeating a shape in a row or grid. */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  const m = (p: Vec): Vec => [p[0] + dx, p[1] + dy];
  switch (shape.type) {
    case 'line':
    case 'arrow':
    case 'wave':
      return { ...shape, from: m(shape.from), to: m(shape.to) };
    case 'polyline':
    case 'curve':
      return { ...shape, points: shape.points.map(m) };
    case 'ellipse':
    case 'arc':
      return { ...shape, center: m(shape.center) };
    case 'rect':
    case 'text':
    case 'stick_figure':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
}

function penPaths(shape: Shape, rand: () => number, wobble: number): PenPath[] {
  // People rarely land exactly on target; nudge free endpoints a little.
  const miss = (p: Vec, amount = 1.5): Vec => [p[0] + (rand() - 0.5) * 2 * amount * wobble, p[1] + (rand() - 0.5) * 2 * amount * wobble];

  switch (shape.type) {
    case 'line':
      return [[[miss(shape.from), miss(shape.to)]]];

    case 'arrow': {
      const shaft = arrowShaft(shape.from, shape.to, shape.bend ?? 0);
      const end = shaft[shaft.length - 1];
      const before = shaft[Math.max(0, shaft.length - 4)];
      const len = Math.hypot(shape.to[0] - shape.from[0], shape.to[1] - shape.from[1]);
      const head = clamp(len * 0.18, 14, 34);
      const angle = Math.atan2(end[1] - before[1], end[0] - before[0]);
      const wing = (side: number): Vec => {
        const a = angle + Math.PI + side * (0.5 + (rand() - 0.5) * 0.12);
        return [end[0] + Math.cos(a) * head, end[1] + Math.sin(a) * head];
      };
      // Shaft, then the head as one "<" stroke: wing → tip → wing.
      return [[shaft], [[wing(1), end], [end, wing(-1)]]];
    }

    case 'polyline': {
      const pts = shape.closed ? [...shape.points, shape.points[0]] : shape.points;
      return [pairs(pts)];
    }

    case 'curve':
      return [[catmullRom(shape.closed ? [...shape.points, shape.points[0]] : shape.points, shape.closed)]];

    case 'ellipse':
      return [[ellipsePath(shape.center, shape.rx, shape.ry ?? shape.rx, rand, wobble)]];

    case 'arc': {
      const ry = shape.ry ?? shape.rx;
      const a0 = (shape.from * Math.PI) / 180, a1 = (shape.to * Math.PI) / 180;
      const n = Math.max(8, Math.ceil((Math.max(shape.rx, ry) * Math.abs(a1 - a0)) / 6));
      const pts: Vec[] = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push([shape.center[0] + Math.cos(a) * shape.rx, shape.center[1] + Math.sin(a) * ry]);
      }
      return [[pts]];
    }

    case 'wave': {
      const [x0, y0] = shape.from, [x1, y1] = shape.to;
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      // Unit vectors along the line and perpendicular to it ("up" for a left-to-right wave).
      const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      const nx = uy, ny = -ux;
      const phase = ((shape.phase ?? 0) * Math.PI) / 180;
      const n = Math.max(8, Math.ceil((len / Math.max(1, shape.wavelength)) * 16));
      const pts: Vec[] = [];
      for (let i = 0; i <= n; i++) {
        const s = (len * i) / n;
        const off = shape.amplitude * Math.sin((2 * Math.PI * s) / shape.wavelength + phase);
        pts.push([x0 + ux * s + nx * off, y0 + uy * s + ny * off]);
      }
      return [[pts]];
    }

    case 'rect': {
      const { x, y, width: w, height: h } = shape;
      const over = Math.min(w * 0.08, 12);
      // One continuous stroke clockwise from the top-left, overshooting the start a bit.
      return [pairs([miss([x, y]), [x + w, y], [x + w, y + h], [x, y + h], [x, y], miss([x + over, y - 1])])];
    }

    case 'text': {
      const h = shape.height ?? 60;
      const w = measureText(shape.text, h);
      const x = shape.align === 'center' ? shape.x - w / 2 : shape.align === 'right' ? shape.x - w : shape.x;
      return textPenPaths(shape.text, x, shape.y, h, rand, wobble);
    }

    case 'stick_figure':
      return stickFigure(shape, rand);
  }
}

function pairs(points: Vec[]): Vec[][] {
  const segs: Vec[][] = [];
  for (let i = 1; i < points.length; i++) segs.push([points[i - 1], points[i]]);
  return segs.length ? segs : [[points[0]]];
}

function arrowShaft(from: Vec, to: Vec, bend: number): Vec[] {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const c: Vec = [mx - dy * bend * 0.35, my + dx * bend * 0.35];
  const pts: Vec[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push([
      (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * c[0] + t * t * to[0],
      (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * c[1] + t * t * to[1],
    ]);
  }
  return pts;
}

function ellipsePath(center: Vec, rx: number, ry: number, rand: () => number, wobble: number): Vec[] {
  // Start near the top and go counter-clockwise (how most people draw circles),
  // overshooting past the start with a slight spiral so the ends don't line up exactly.
  const start = -Math.PI / 2 - 0.3 - rand() * 0.6;
  // Overshoot by a short, fixed arc length (~25-40px), not a fixed angle, so big circles
  // don't end in a long doubled-up stretch where the slow start and slow finish overlap.
  const overshoot = clamp(32 / ((rx + ry) / 2), 0.06, 0.5) * (0.8 + rand() * 0.4);
  const sweep = Math.PI * 2 + overshoot;
  // The closing pass drifts in or out by a couple of pixels: enough to read as hand-drawn,
  // little enough that the overlap merges into one line instead of a doubled seam.
  const drift = ((rand() < 0.5 ? -1 : 1) * (1 + rand() * 1.5) * wobble) / Math.max(rx, ry, 1);
  const squash = rand() * Math.PI;
  const n = Math.max(24, Math.ceil((Math.max(rx, ry) * sweep) / 6));
  const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = start - sweep * u;
    const r = 1 + drift * u + 0.03 * wobble * Math.sin(2 * a + squash);
    pts.push([center[0] + Math.cos(a) * rx * r, center[1] + Math.sin(a) * ry * r]);
  }
  return pts;
}

/** Smooth curve through every point (centripetal-ish Catmull-Rom, sampled). */
function catmullRom(points: Vec[], closed = false): Vec[] {
  if (points.length < 3) return points;
  const get = (i: number) =>
    closed ? points[(i + points.length - 1) % (points.length - 1)] : points[clamp(i, 0, points.length - 1)];
  const out: Vec[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)];
    const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 8));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function stickFigure(shape: Extract<Shape, { type: 'stick_figure' }>, rand: () => number): PenPath[] {
  const { x, y } = shape;
  const H = shape.height ?? 260;
  const dir = shape.facing === 'left' ? -1 : 1;
  const pose = shape.pose ?? 'stand';
  const headR = H * 0.11;
  // Sitting lowers the body by the length of the thighs (now horizontal) and sets the
  // torso back a little so the knees end up near x.
  const sitting = pose === 'sit';
  const drop = sitting ? H * 0.15 : 0;
  const bx = sitting ? x - dir * H * 0.08 : x;
  const head: Vec = [bx, y - H + headR + drop];
  const neck: Vec = [bx, y - H + headR * 2 + drop];
  const shoulder: Vec = [bx, neck[1] + H * 0.07];
  const hip: Vec = [bx + (rand() - 0.5) * H * 0.02, y - H * 0.42 + drop];
  const at = (dx: number, dy: number): Vec => [bx + dx * H, shoulder[1] + dy * H];
  const knee: Vec = [hip[0] + dir * H * 0.2, hip[1] + H * 0.01];

  const armDown = (side: number): Vec[] => [shoulder, at(side * 0.16, 0.27)];
  const arms: Record<Pose, [Vec[], Vec[]]> = {
    stand: [armDown(-dir), armDown(dir)],
    wave: [armDown(-dir), [shoulder, at(dir * 0.16, -0.03), at(dir * 0.22, -0.22)]],
    cheer: [
      [shoulder, at(-0.17, 0.03), at(-0.2, -0.15)],
      [shoulder, at(0.17, 0.03), at(0.2, -0.15)],
    ],
    point: [armDown(-dir), [shoulder, at(dir * 0.32, -0.03)]],
    think: [armDown(-dir), [shoulder, at(dir * 0.15, 0.15), [x + dir * headR * 0.5, neck[1] - headR * 0.25]]],
    shrug: [
      [shoulder, at(-0.15, 0.1), at(-0.23, -0.04)],
      [shoulder, at(0.15, 0.1), at(0.23, -0.04)],
    ],
    // Hands resting on the knees.
    sit: [
      [shoulder, at(dir * 0.06, 0.16), [knee[0] - dir * H * 0.05, knee[1] - H * 0.03]],
      [shoulder, at(dir * 0.09, 0.15), [knee[0] - dir * H * 0.01, knee[1] - H * 0.02]],
    ],
  };
  // Seated legs run forward to the knee, then down to the floor.
  const legs: Vec[][] = sitting
    ? [
        [hip, knee, [knee[0] + dir * H * 0.02, y]],
        [hip, [knee[0] - dir * H * 0.03, knee[1] + H * 0.02], [knee[0] - dir * H * 0.06, y]],
      ]
    : [
        [hip, [x - H * 0.13, y]],
        [hip, [x + H * 0.13, y]],
      ];

  const paths: PenPath[] = [
    [ellipsePath(head, headR, headR * 1.05, rand, 0.6)],
    ...hairPaths(shape.hair ?? 'none', head, headR, dir, rand),
    [[neck, hip]],
    pairs(arms[pose][0]),
    pairs(arms[pose][1]),
    pairs(legs[0]),
    pairs(legs[1]),
  ];

  const face = shape.face ?? 'happy';
  if (face !== 'none') {
    const fx = head[0] + dir * headR * 0.15;
    const eyeY = head[1] - headR * 0.15;
    const eye = (dx: number): PenPath => [[[fx + dx, eyeY]]];
    paths.push(eye(-headR * 0.35), eye(headR * 0.35));
    const my = head[1] + headR * 0.4;
    const w = headR * 0.4;
    if (face === 'happy') paths.push([catmullRom([[fx - w, my - 2], [fx, my + w * 0.55], [fx + w, my - 2]])]);
    if (face === 'sad') paths.push([catmullRom([[fx - w, my + w * 0.45], [fx, my - 1], [fx + w, my + w * 0.45]])]);
    if (face === 'neutral') paths.push([[[fx - w * 0.7, my + 2], [fx + w * 0.7, my + 2]]]);
    if (face === 'surprised') paths.push([ellipsePath([fx, my + 3], w * 0.4, w * 0.5, rand, 0.3)]);
  }
  return paths;
}

/** Hair hugs the top of the head, drawn right after the head outline. */
function hairPaths(hair: Hair, [hx, hy]: Vec, r: number, dir: number, rand: () => number): PenPath[] {
  if (hair === 'none') return [];
  const at = (deg: number, k: number): Vec => {
    const a = (deg * Math.PI) / 180;
    return [hx + Math.cos(a) * r * k, hy + Math.sin(a) * r * k];
  };
  // Angles run over the top of the head (screen y is down, so -90 is straight up).
  const sweep = (from: number, to: number, n: number, inner: number, outer: number) =>
    Array.from({ length: n + 1 }, (_, i) => at(from + ((to - from) * i) / n + (rand() - 0.5) * 6, i % 2 ? outer : inner));

  if (hair === 'spiky') return [pairs(sweep(-200, 20, 10, 1.02, 1.45))];
  if (hair === 'messy') {
    return [
      [catmullRom(sweep(-205, 25, 12, 0.98, 1.28))],
      [catmullRom(sweep(-170, -10, 7, 1.05, 1.22))],
    ];
  }
  // long: a scribbly cap, then strands falling past the jaw on both sides.
  const back = dir > 0 ? -1 : 1;
  return [
    [catmullRom(sweep(-210, 30, 12, 0.98, 1.24))],
    [catmullRom([at(-150, 1.1), at(-190, 1.18), [hx + back * r * 1.2, hy + r * 1.1], [hx + back * r * 1.1, hy + r * 1.9]])],
    [catmullRom([at(-40, 1.1), at(-5, 1.15), [hx - back * r * 1.12, hy + r * 1.0], [hx - back * r * 1.0, hy + r * 1.6]])],
  ];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
