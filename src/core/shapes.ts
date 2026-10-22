import type { BrushStyle } from './brushes';
import { humanizePath, type Vec } from './humanize';
import { PALETTE, SIZES, uid, type Stroke } from './model';

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
    | { type: 'rect'; x: number; y: number; width: number; height: number }
    | {
        type: 'stick_figure';
        /** Where the feet touch the ground. */
        x: number;
        y: number;
        height?: number;
        pose?: Pose;
        face?: Face;
        facing?: 'left' | 'right';
      }
  );

export interface ShapeStyle {
  color?: string;
  size?: number;
  brush?: BrushStyle;
}

export const POSES = ['stand', 'wave', 'cheer', 'point', 'think', 'shrug'] as const;
export const FACES = ['happy', 'neutral', 'sad', 'surprised', 'none'] as const;
export type Pose = (typeof POSES)[number];
export type Face = (typeof FACES)[number];

export interface DrawContext {
  rand: () => number;
  wobble?: number;
  speed?: number;
  color?: string;
  size?: number;
  brush?: BrushStyle;
}

/** A stroke as ideal geometry: segments of one continuous pen movement. */
type PenPath = Vec[][];

export function shapeToStrokes(shape: Shape, ctx: DrawContext): Stroke[] {
  const color = shape.color ?? ctx.color ?? PALETTE[0];
  const size = shape.size ?? ctx.size ?? SIZES.medium;
  const brush = shape.brush ?? ctx.brush;
  const wobble = ctx.wobble ?? 1;
  return penPaths(shape, ctx.rand, wobble).map((segments) => ({
    id: uid(),
    color,
    size,
    ...(brush && brush !== 'marker' ? { brush } : {}),
    simulatePressure: true,
    points: humanizePath(segments, { rand: ctx.rand, wobble, speed: ctx.speed }),
  }));
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

    case 'rect': {
      const { x, y, width: w, height: h } = shape;
      const over = Math.min(w * 0.08, 12);
      // One continuous stroke clockwise from the top-left, overshooting the start a bit.
      return [pairs([miss([x, y]), [x + w, y], [x + w, y + h], [x, y + h], [x, y], miss([x + over, y - 1])])];
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
  const sweep = Math.PI * 2 + 0.25 + rand() * 0.3;
  const drift = (rand() - 0.5) * 0.08 * wobble;
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
  const head: Vec = [x, y - H + headR];
  const neck: Vec = [x, y - H + headR * 2];
  const shoulder: Vec = [x, neck[1] + H * 0.07];
  const hip: Vec = [x + (rand() - 0.5) * H * 0.02, y - H * 0.42];
  const at = (dx: number, dy: number): Vec => [x + dx * H, shoulder[1] + dy * H];

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
  };

  const paths: PenPath[] = [
    [ellipsePath(head, headR, headR * 1.05, rand, 0.6)],
    [[neck, hip]],
    pairs(arms[pose][0]),
    pairs(arms[pose][1]),
    [[hip, [x - H * 0.13, y]]],
    [[hip, [x + H * 0.13, y]]],
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
