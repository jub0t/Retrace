// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { distanceToStroke, strokesBounds, uid, type Bounds, type Project, type Stroke } from '../core';
import { drawBackground, drawFrame, drawLiveStroke, drawStroke } from './render';
import { actions, getState, subscribe, useEditor } from './store';
import { Kbd, cx } from './ui';

const PADDING = 32;
/** Room for the floating menu bar and toolbar, so they never cover the artboard. */
const TOP_CHROME = 64;
const ERASER_RADIUS = 14;
/** Screen-pixel sizes for selection chrome, so it feels the same at any zoom. */
const SELECT_PAD = 8;
const HANDLE_SIZE = 10;
const HIT_SLOP = 6;
export const ASSET_DRAG_TYPE = 'application/x-retrace-asset';

type SelectDrag =
  | { kind: 'move'; start: [number, number]; base: Project; map?: (x: number, y: number) => [number, number] }
  | { kind: 'scale'; anchor: [number, number]; startDist: number; base: Project; k?: number }
  | { kind: 'marquee'; start: [number, number]; end: [number, number]; additive: boolean };

interface Layout {
  width: number;
  height: number;
  scale: number;
  ox: number;
  oy: number;
}

/** The artboard: fixed project-size frame scaled to fit, where strokes are drawn and played back. */
export function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const tool = useEditor((s) => s.tool);
  const previewing = useEditor((s) => s.playhead !== null);
  const empty = useEditor((s) => s.project.steps.every((st) => st.strokes.length === 0));
  const pw = useEditor((s) => s.project.width);
  const ph = useEditor((s) => s.project.height);

  const draft = useRef<{ stroke: Stroke; start: number } | null>(null);
  const erasing = useRef<Set<string> | null>(null);
  const hover = useRef<[number, number] | null>(null);
  const hoverStroke = useRef<string | null>(null);
  const selectDrag = useRef<SelectDrag | null>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current!;
    const measure = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const scale = Math.max(0.05, Math.min((width - PADDING * 2) / pw, (height - TOP_CHROME - PADDING) / ph));
      setLayout({ width, height, scale, ox: (width - pw * scale) / 2, oy: TOP_CHROME + (height - TOP_CHROME - PADDING - ph * scale) / 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [pw, ph]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const { project, current, onion, playhead, selection, tool, size } = getState();
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * layout.scale, 0, 0, dpr * layout.scale, dpr * layout.ox, dpr * layout.oy);

    // Paper lifted off the workspace (shadow sizes are in device pixels, unaffected by the transform).
    ctx.save();
    ctx.shadowColor = 'rgba(15, 20, 30, 0.10)';
    ctx.shadowBlur = 28 * dpr;
    ctx.shadowOffsetY = 4 * dpr;
    ctx.fillStyle = project.background;
    ctx.fillRect(0, 0, project.width, project.height);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, project.width, project.height);
    ctx.clip();

    if (playhead !== null) {
      drawFrame(ctx, project, playhead);
    } else {
      drawBackground(ctx, project);
      project.steps.forEach((step, i) => {
        if (i > current + (onion ? 1 : 0)) return;
        ctx.globalAlpha = i === current ? 1 : i < current ? (onion ? 0.25 : 1) : 0.08;
        for (const s of step.strokes) if (!(i === current && erasing.current?.has(s.id))) drawStroke(ctx, s);
      });
      ctx.globalAlpha = 1;
      if (draft.current) drawLiveStroke(ctx, draft.current.stroke);
    }
    ctx.restore();

    const px = 1 / layout.scale;
    if (playhead === null && tool === 'select' && hoverStroke.current && !selection.has(hoverStroke.current)) {
      const hovered = project.steps[current].strokes.find((s) => s.id === hoverStroke.current);
      const hb = hovered && strokesBounds([hovered]);
      if (hb) {
        ctx.lineWidth = 1.5 * px;
        ctx.strokeStyle = 'rgba(91, 91, 214, 0.45)';
        ctx.strokeRect(hb.x - 4 * px, hb.y - 4 * px, hb.width + 8 * px, hb.height + 8 * px);
      }
    }

    const b = playhead === null ? selectionBounds(project, current, selection) : null;
    if (b) {
      const pad = SELECT_PAD * px;
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = '#5b5bd6';
      ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
      ctx.setLineDash([]);
      if (tool === 'select') {
        const h = HANDLE_SIZE * px;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x + b.width + pad - h / 2, b.y + b.height + pad - h / 2, h, h);
        ctx.strokeRect(b.x + b.width + pad - h / 2, b.y + b.height + pad - h / 2, h, h);
      }
    }

    const drag = selectDrag.current;
    if (drag?.kind === 'marquee') {
      const [x0, y0] = drag.start;
      const [x1, y1] = drag.end;
      ctx.fillStyle = 'rgba(91, 91, 214, 0.08)';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.lineWidth = 1 * px;
      ctx.strokeStyle = 'rgba(91, 91, 214, 0.7)';
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    if (playhead === null && hover.current && tool !== 'select') {
      const [hx, hy] = hover.current;
      ctx.beginPath();
      ctx.arc(hx, hy, tool === 'eraser' ? ERASER_RADIUS : size / 2, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / layout.scale;
      ctx.strokeStyle = tool === 'eraser' ? '#868e96' : 'rgba(30,30,30,0.35)';
      ctx.stroke();
    }
  }, [layout]);

  const requestPaint = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.width * dpr);
    canvas.height = Math.round(layout.height * dpr);
    paint();
  }, [layout, paint]);

  useEffect(() => subscribe(requestPaint), [requestPaint]);

  const toProject = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - rect.left - layout!.ox) / layout!.scale, (e.clientY - rect.top - layout!.oy) / layout!.scale];
  };

  const addPoint = (e: PointerEvent) => {
    const d = draft.current!;
    const [x, y] = toProject(e);
    const t = Math.round(e.timeStamp - d.start);
    const pts = d.stroke.points;
    if (pts.length && pts[pts.length - 1][3] >= t) return;
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    pts.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100, pressure, t]);
  };

  const strokeAt = (x: number, y: number): Stroke | undefined => {
    const { project, current } = getState();
    const strokes = project.steps[current].strokes;
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (distanceToStroke(strokes[i], x, y) <= strokes[i].size / 2 + HIT_SLOP / layout!.scale) return strokes[i];
    }
  };

  /** Where the pointer is relative to the current selection. */
  const selectionHit = (x: number, y: number): 'handle' | 'inside' | null => {
    const { project, current, selection } = getState();
    const b = selectionBounds(project, current, selection);
    if (!b) return null;
    const pad = SELECT_PAD / layout!.scale;
    const reach = HANDLE_SIZE / layout!.scale;
    if (Math.abs(x - (b.x + b.width + pad)) <= reach && Math.abs(y - (b.y + b.height + pad)) <= reach) return 'handle';
    if (x >= b.x - pad && x <= b.x + b.width + pad && y >= b.y - pad && y <= b.y + b.height + pad) return 'inside';
    return null;
  };

  const startSelect = (e: React.PointerEvent) => {
    const p = toProject(e);
    const { project, current, selection } = getState();
    const hit = selectionHit(...p);
    if (hit === 'handle') {
      const b = selectionBounds(project, current, selection)!;
      selectDrag.current = { kind: 'scale', anchor: [b.x, b.y], startDist: Math.max(1, Math.hypot(p[0] - b.x, p[1] - b.y)), base: project };
      return;
    }
    const stroke = strokeAt(...p);
    if (stroke && e.shiftKey) {
      const next = new Set(selection);
      if (next.has(stroke.id)) next.delete(stroke.id);
      else next.add(stroke.id);
      actions.setSelection(next);
      return;
    }
    if (stroke || hit === 'inside') {
      if (stroke && !selection.has(stroke.id)) actions.setSelection([stroke.id]);
      selectDrag.current = { kind: 'move', start: p, base: getState().project };
      return;
    }
    if (!e.shiftKey) actions.clearSelection();
    selectDrag.current = { kind: 'marquee', start: p, end: p, additive: e.shiftKey };
  };

  const moveSelect = (p: [number, number]) => {
    const drag = selectDrag.current!;
    if (drag.kind === 'move') {
      const dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
      drag.map = (x, y) => [x + dx, y + dy];
      actions.transformSelection(drag.base, drag.map, 1, false);
    } else if (drag.kind === 'scale') {
      const [ax, ay] = drag.anchor;
      const k = Math.min(20, Math.max(0.05, Math.hypot(p[0] - ax, p[1] - ay) / drag.startDist));
      drag.k = k;
      actions.transformSelection(drag.base, (x, y) => [ax + (x - ax) * k, ay + (y - ay) * k], k, false);
    } else {
      drag.end = p;
    }
  };

  const endSelect = () => {
    const drag = selectDrag.current!;
    selectDrag.current = null;
    if (drag.kind === 'move' && drag.map) actions.transformSelection(drag.base, drag.map, 1, true);
    if (drag.kind === 'scale' && drag.k) {
      const [ax, ay] = drag.anchor;
      const k = drag.k;
      actions.transformSelection(drag.base, (x, y) => [ax + (x - ax) * k, ay + (y - ay) * k], k, true);
    }
    if (drag.kind === 'marquee') {
      const [x0, x1] = [Math.min(drag.start[0], drag.end[0]), Math.max(drag.start[0], drag.end[0])];
      const [y0, y1] = [Math.min(drag.start[1], drag.end[1]), Math.max(drag.start[1], drag.end[1])];
      if (x1 - x0 < 2 && y1 - y0 < 2) return;
      const { project, current, selection } = getState();
      const inside = project.steps[current].strokes
        .filter((s) => s.points.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1))
        .map((s) => s.id);
      actions.setSelection(drag.additive ? [...selection, ...inside] : inside);
    }
  };

  const updateSelectCursor = (p: [number, number]) => {
    const canvas = canvasRef.current!;
    const hit = selectionHit(...p);
    const stroke = strokeAt(...p);
    hoverStroke.current = stroke?.id ?? null;
    canvas.style.cursor = hit === 'handle' ? 'nwse-resize' : hit === 'inside' || stroke ? 'move' : 'default';
  };

  const eraseAt = (x: number, y: number) => {
    const { project, current } = getState();
    for (const s of project.steps[current].strokes) {
      if (distanceToStroke(s, x, y) <= ERASER_RADIUS + s.size / 2) erasing.current!.add(s.id);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !layout) return;
    const { tool, color, size, brush } = getState();
    actions.exitPreview();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'select') {
      startSelect(e);
      requestPaint();
      return;
    }
    actions.clearSelection();
    if (tool === 'pen') {
      draft.current = {
        start: e.timeStamp,
        stroke: { id: uid(), color, size, ...(brush !== 'marker' && { brush }), simulatePressure: e.pointerType !== 'pen', points: [] },
      };
      draft.current.stroke.points.push([...toProject(e), e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5, 0]);
    } else {
      erasing.current = new Set();
      eraseAt(...toProject(e));
    }
    requestPaint();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!layout) return;
    hover.current = toProject(e);
    if (getState().tool !== 'select') canvasRef.current!.style.cursor = '';
    if (selectDrag.current) {
      moveSelect(hover.current);
    } else if (getState().tool === 'select') {
      updateSelectCursor(hover.current);
    } else if (draft.current) {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of events.length ? events : [e.nativeEvent]) addPoint(ev);
    } else if (erasing.current) {
      eraseAt(...hover.current);
    }
    requestPaint();
  };

  const onPointerUp = () => {
    if (selectDrag.current) endSelect();
    if (draft.current) {
      const { stroke } = draft.current;
      draft.current = null;
      actions.addStroke(stroke);
    }
    if (erasing.current) {
      const ids = erasing.current;
      erasing.current = null;
      actions.eraseStrokes(ids);
    }
    requestPaint();
  };

  const onPointerLeave = () => {
    hover.current = null;
    hoverStroke.current = null;
    requestPaint();
  };

  // Objects dragged in from the library land centered under the pointer.
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(ASSET_DRAG_TYPE);
    const asset = getState().library.find((a) => a.id === id);
    if (!asset || !layout) return;
    e.preventDefault();
    actions.insertAsset(asset, ...toProject(e));
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className={cx('block touch-none', previewing || tool === 'select' ? 'cursor-default' : tool === 'pen' ? 'cursor-crosshair' : 'cursor-none')}
        style={layout ? { width: layout.width, height: layout.height } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
      {empty && !previewing && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 w-[min(440px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 text-center leading-relaxed text-faint">
          <p className="mb-1 text-[22px] font-semibold tracking-tight text-muted">Draw something.</p>
          <p>
            Every stroke is recorded as you draw it. Press <Kbd>N</Kbd> for the next step, <Kbd>Space</Kbd> to watch it play
            back. <Kbd>?</Kbd> shows all shortcuts.
          </p>
        </div>
      )}
    </div>
  );
}

function selectionBounds(project: Project, current: number, selection: ReadonlySet<string>): Bounds | null {
  if (!selection.size) return null;
  return strokesBounds(project.steps[current].strokes.filter((s) => selection.has(s.id)));
}
