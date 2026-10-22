// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { brushOf } from './brushes';
import { strokeOutlinePath } from './geometry';
import { svgPaint } from './paint';
import type { Project, Stroke } from './model';
import { getTimeline } from './timeline';

export interface SvgOptions {
  /** Last step to include (inclusive). Defaults to the final step. */
  uptoStep?: number;
  transparent?: boolean;
}

/** The finished drawing (up to a step) as a static SVG. */
export function renderSvg(project: Project, opts: SvgOptions = {}): string {
  const upto = opts.uptoStep ?? project.steps.length - 1;
  const defs: string[] = [];
  const paths = project.steps.slice(0, upto + 1).flatMap((step) => step.strokes).map((s, i) => {
    const paint = svgPaint(s, `p${i}`);
    if (paint.def) defs.push(paint.def);
    return `<path d="${strokeOutlinePath(s)}" fill="${paint.fill}"${opacityAttr(s)}/>`;
  });
  const body = (defs.length ? `<defs>\n${defs.join('\n')}\n</defs>\n` : '') + paths.join('\n');
  return wrap(project, body, opts.transparent);
}

export interface AnimatedSvgOptions {
  transparent?: boolean;
  loop?: boolean;
  /** Extra pause on the finished drawing before looping, in ms. */
  tail?: number;
}

/**
 * A self-playing SVG (SMIL, no script). Each stroke's outline is revealed by a mask
 * that traces the stroke's centerline at the speed it was originally drawn.
 */
export function renderAnimatedSvg(project: Project, opts: AnimatedSvgOptions = {}): string {
  const { loop = true, tail = 1500 } = opts;
  const timeline = getTimeline(project);
  const total = Math.max(1, timeline.duration + tail);
  const repeat = loop ? 'indefinite' : '1';

  const defs: string[] = [];
  const paths: string[] = [];
  timeline.strokes.forEach(({ stroke, start, duration }, i) => {
    const { centerline, lengths } = measure(stroke);
    const L = lengths[lengths.length - 1];
    const w = stroke.size * 1.6;
    const hidden = L + w;

    // Sample the reveal at recorded times so the pen speeds up and slows down as drawn.
    const samples = Math.min(16, stroke.points.length);
    const keys: [number, number][] = [[0, hidden], [start, hidden]];
    for (let k = 1; k <= samples; k++) {
      const idx = Math.round((k / samples) * (stroke.points.length - 1));
      const t = start + (duration ? (stroke.points[idx][3] / stroke.points[stroke.points.length - 1][3] || 0) * duration : 0);
      keys.push([t, L - lengths[idx]]);
    }
    keys.push([total, 0]);
    const { keyTimes, values } = toKeyframes(keys, total);

    defs.push(
      `<mask id="m${i}" maskUnits="userSpaceOnUse"><polyline points="${centerline}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${fmt(L)} ${fmt(2 * L + 2 * w)}" stroke-dashoffset="${fmt(hidden)}">` +
        `<animate attributeName="stroke-dashoffset" dur="${fmt(total / 1000)}s" repeatCount="${repeat}" fill="freeze" keyTimes="${keyTimes}" values="${values}"/>` +
        `</polyline></mask>`,
    );
    const paint = svgPaint(stroke, `p${i}`);
    if (paint.def) defs.push(paint.def);
    paths.push(`<path d="${strokeOutlinePath(stroke)}" fill="${paint.fill}"${opacityAttr(stroke)} mask="url(#m${i})"/>`);
  });

  return wrap(project, `<defs>\n${defs.join('\n')}\n</defs>\n${paths.join('\n')}`, opts.transparent);
}

function opacityAttr(stroke: Stroke): string {
  const { opacity } = brushOf(stroke.brush);
  return opacity < 1 ? ` fill-opacity="${opacity}"` : '';
}

function measure(stroke: Stroke) {
  const lengths = [0];
  const pts = stroke.points;
  for (let i = 1; i < pts.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { centerline: pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' '), lengths };
}

function toKeyframes(keys: [number, number][], total: number) {
  const times: string[] = [];
  const values: string[] = [];
  let last = -1;
  for (const [t, v] of keys) {
    const kt = Math.min(1, Math.max(0, t / total));
    if (kt <= last && times.length) {
      values[values.length - 1] = fmt(v); // same instant: keep the later value
      continue;
    }
    times.push(kt.toFixed(5));
    values.push(fmt(v));
    last = kt;
  }
  return { keyTimes: times.join(';'), values: values.join(';') };
}

function wrap(project: Project, body: string, transparent = false): string {
  const bg = transparent ? '' : `<rect width="100%" height="100%" fill="${project.background}"/>\n`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}" viewBox="0 0 ${project.width} ${project.height}">\n` +
    `${bg}${body}\n</svg>\n`
  );
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
