// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { brushOf, gradientBox, gradientGeometry, sortedStops, getTimeline, paintOrder, pointsAt, strokeDuration, strokeFillPath, strokeOutlinePath, visibleStrokes, type Project, type Stroke } from '../core';

// Finished strokes are immutable, so their outline (and fill area) can be built once.
const pathCache = new WeakMap<Stroke, Path2D>();
const fillCache = new WeakMap<Stroke, Path2D>();

/** Draw a stroke, or only the part drawn `elapsed` ms into its recorded motion. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, elapsed = Infinity): void {
  if (elapsed >= strokeDuration(stroke)) {
    if (stroke.fill) {
      let area = fillCache.get(stroke);
      if (!area) {
        area = new Path2D(strokeFillPath(stroke));
        fillCache.set(stroke, area);
      }
      ctx.fillStyle = stroke.fill;
      ctx.fill(area);
    }
    let path = pathCache.get(stroke);
    if (!path) {
      path = new Path2D(strokeOutlinePath(stroke));
      pathCache.set(stroke, path);
    }
    fill(ctx, stroke, path);
    return;
  }
  fill(ctx, stroke, new Path2D(strokeOutlinePath(stroke, pointsAt(stroke, elapsed), false)));
}

/** A stroke still being drawn (its points array keeps growing, so it can't be cached). */
export function drawLiveStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  fill(ctx, stroke, new Path2D(strokeOutlinePath(stroke, stroke.points, false)));
}

function fill(ctx: CanvasRenderingContext2D, stroke: Stroke, path: Path2D) {
  const { opacity } = brushOf(stroke.brush);
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * opacity; // compose with onion-skin dimming
  ctx.fillStyle = paintFor(ctx, stroke);
  ctx.fill(path);
  ctx.globalAlpha = alpha;
}

/**
 * Solid color, or a gradient laid over the whole finished stroke (even mid-playback, so
 * the colors don't slide around while the stroke is still being drawn).
 */
function paintFor(ctx: CanvasRenderingContext2D, stroke: Stroke): string | CanvasGradient {
  if (!stroke.gradient) return stroke.color;
  const b = gradientBox(stroke);
  if (!b) return stroke.color;
  const geo = gradientGeometry(stroke.gradient, b);
  const g = geo.type === 'linear' ? ctx.createLinearGradient(geo.x1, geo.y1, geo.x2, geo.y2) : ctx.createRadialGradient(geo.cx, geo.cy, 0, geo.cx, geo.cy, geo.r);
  for (const s of sortedStops(stroke.gradient)) g.addColorStop(s.offset, s.color);
  return g;
}

export function drawBackground(ctx: CanvasRenderingContext2D, project: Project, transparent = false): void {
  if (transparent) {
    ctx.clearRect(0, 0, project.width, project.height);
  } else {
    ctx.fillStyle = project.background;
    ctx.fillRect(0, 0, project.width, project.height);
  }
}

/** One playback frame at `time` ms, in project coordinates. */
export function drawFrame(ctx: CanvasRenderingContext2D, project: Project, time: number, transparent = false): void {
  drawBackground(ctx, project, transparent);
  for (const { stroke, elapsed } of paintOrder([...visibleStrokes(getTimeline(project), time)], (v) => v.z)) drawStroke(ctx, stroke, elapsed);
}

/**
 * Draw strokes bottom to top (each with an optional alpha, e.g. onion-skin dimming), by
 * their stacking key `z` when given (see `strokeZ`), otherwise by their own layer.
 */
export function drawStack(ctx: CanvasRenderingContext2D, items: { stroke: Stroke; alpha?: number; z?: number }[]): void {
  const base = ctx.globalAlpha;
  for (const { stroke, alpha = 1 } of paintOrder(items, (it) => it.z ?? it.stroke.layer ?? 0)) {
    ctx.globalAlpha = base * alpha;
    drawStroke(ctx, stroke);
  }
  ctx.globalAlpha = base;
}
