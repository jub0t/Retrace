import type { Point } from './model';

export type Vec = [x: number, y: number];

/** Deterministic PRNG (mulberry32) so a seed always produces the same scrawl. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HumanizeOptions {
  rand: () => number;
  /** 0 = ruler-straight, 1 = natural, 2 = very scrawly. */
  wobble?: number;
  /** Peak-ish drawing speed in px/ms; ~1.6 feels like a confident marker. */
  speed?: number;
}

const SAMPLE_MS = 8; // ~120 Hz, like a real pointer
const RESAMPLE_PX = 2;
const CORNER_DWELL_MS = 35;
const MOMENTUM = 0.3;

/**
 * Turns an ideal pen path into points that look recorded from a human hand.
 *
 * `segments` are consecutive pieces of one continuous stroke (each piece's first point
 * is the previous piece's last). The pen accelerates and decelerates within each piece
 * (minimum-jerk profile) and briefly dwells at the joins, which is how people draw corners.
 * A smooth low-frequency wobble pushes the line sideways, fading out at both ends so
 * the stroke still starts and lands where intended.
 */
export function humanizePath(segments: Vec[][], opts: HumanizeOptions): Point[] {
  const { rand, wobble = 1, speed = 1.6 } = opts;

  // 1. Dense polyline + where each segment ends along it.
  const dense: Vec[] = [];
  const segEnds: number[] = []; // cumulative length at the end of each segment
  let total = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.length; i++) {
      const p = seg[i];
      const prev = dense[dense.length - 1];
      if (!prev) {
        dense.push(p);
        continue;
      }
      const d = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (d === 0) continue;
      const n = Math.max(1, Math.ceil(d / RESAMPLE_PX));
      for (let k = 1; k <= n; k++) {
        dense.push([prev[0] + ((p[0] - prev[0]) * k) / n, prev[1] + ((p[1] - prev[1]) * k) / n]);
      }
      total += d;
    }
    segEnds.push(total);
  }
  if (dense.length === 1) dense.push([dense[0][0] + 0.5, dense[0][1] + 0.3]); // a dot

  const cum = cumulativeLengths(dense);
  total = cum[cum.length - 1];

  // 2. Sideways wobble: two sine layers with random phase, scaled by stroke length.
  const amp = wobble * clamp(total * 0.009, 0.5, 5);
  const f1 = 0.6 + rand() * 0.9, p1 = rand() * Math.PI * 2;
  const f2 = 2.5 + rand() * 3, p2 = rand() * Math.PI * 2;
  const wobbled: Vec[] = dense.map((p, i) => {
    const u = total ? cum[i] / total : 0;
    const envelope = Math.pow(Math.sin(Math.PI * u), 0.6);
    const offset = amp * envelope * (Math.sin(2 * Math.PI * f1 * u + p1) + 0.3 * Math.sin(2 * Math.PI * f2 * u + p2));
    const a = dense[Math.max(0, i - 2)], b = dense[Math.min(dense.length - 1, i + 2)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] - ((b[1] - a[1]) / len) * offset, p[1] + ((b[0] - a[0]) / len) * offset];
  });

  // 3. Timing: per-segment minimum-jerk motion, slightly randomized pace.
  const pace = speed * (0.85 + rand() * 0.3);
  const points: Point[] = [];
  let t0 = 0;
  let s0 = 0;
  segEnds.forEach((s1, k) => {
    const len = s1 - s0;
    const dur = 60 + len / pace + 18 * Math.sqrt(len);
    const steps = Math.max(2, Math.ceil(dur / SAMPLE_MS));
    for (let i = k === 0 ? 0 : 1; i <= steps; i++) {
      const tau = i / steps;
      // Mostly minimum-jerk, with some constant speed mixed in: the pen lands already
      // moving, so velocity-simulated pressure doesn't pool ink into blobs at the ends.
      const s = s0 + len * (MOMENTUM * tau + (1 - MOMENTUM) * (10 * tau ** 3 - 15 * tau ** 4 + 6 * tau ** 5));
      const [x, y] = pointAtLength(wobbled, cum, s);
      points.push([round2(x), round2(y), 0.5, Math.round(t0 + tau * dur)]);
    }
    t0 += dur + (k < segEnds.length - 1 ? CORNER_DWELL_MS : 0);
    s0 = s1;
  });
  return dedupeTimes(points);
}

function cumulativeLengths(pts: Vec[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return cum;
}

function pointAtLength(pts: Vec[], cum: number[], s: number): Vec {
  if (s <= 0) return pts[0];
  let lo = 0, hi = cum.length - 1;
  if (s >= cum[hi]) return pts[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const u = (s - cum[lo]) / span;
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u];
}

// Corner dwells can produce repeated positions; keep times strictly increasing.
function dedupeTimes(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || p[3] > points[i - 1][3]);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (n: number) => Math.round(n * 100) / 100;
