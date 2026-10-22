// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { brushOf, getTimeline, pointsAt, strokeDuration, strokeOutlinePath, visibleStrokes, type Project, type Stroke } from '../core';

// Finished strokes are immutable, so their outline can be built once.
const pathCache = new WeakMap<Stroke, Path2D>();

/** Draw a stroke, or only the part drawn `elapsed` ms into its recorded motion. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, elapsed = Infinity): void {
  if (elapsed >= strokeDuration(stroke)) {
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
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
  ctx.globalAlpha = alpha;
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
  for (const { stroke, elapsed } of visibleStrokes(getTimeline(project), time)) drawStroke(ctx, stroke, elapsed);
}
