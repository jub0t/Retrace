// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { distanceToStroke, paintOrder, sceneStart, strokesBounds, uid, type Bounds, type Project, type Stroke } from '../core';
import { FitIcon, MinusIcon, PlusIcon } from './icons';
import { drawBackground, drawFrame, drawLiveStroke, drawStack } from './render';
import { actions, editableRange, editableStrokes, getState, setState, subscribe, useEditor, type View } from './store';
import { IconButton, Kbd, cx } from './ui';

const PADDING = 40;
const ERASER_RADIUS = 14;
/** Screen-pixel sizes for selection chrome, so it feels the same at any zoom. */
const SELECT_PAD = 8;
const HANDLE_SIZE = 10;
/** The accent's deep shade: what is drawn over the near-white paper needs it, the bright one would vanish there. */
const PAPER_ACCENT = '#4d7c0f';
const HIT_SLOP = 6;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
export const ASSET_DRAG_TYPE = 'application/x-retrace-asset';

type Drag =
  | { kind: 'move'; start: [number, number]; base: Project; map?: (x: number, y: number) => [number, number] }
  | { kind: 'scale'; anchor: [number, number]; startDist: number; base: Project; k?: number }
  | { kind: 'marquee'; start: [number, number]; end: [number, number]; additive: boolean }
  | { kind: 'pan'; x: number; y: number; view: View };

/** Size of the canvas area, kept at module level so zoom commands from anywhere can center on it. */
let area = { width: 0, height: 0 };

function fitView(project: Project): View {
  const scale = Math.max(MIN_ZOOM, Math.min((area.width - PADDING * 2) / project.width, (area.height - PADDING * 2) / project.height));
  return { scale, x: (area.width - project.width * scale) / 2, y: (area.height - project.height * scale) / 2 };
}

function currentView(): View {
  const { view, project } = getState();
  return view ?? fitView(project);
}

/** Zoom by `factor` around a point in canvas-area pixels (default: the center). */
export function zoomBy(factor: number, cx = area.width / 2, cy = area.height / 2): void {
  const v = currentView();
  const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.scale * factor));
  const k = scale / v.scale;
  setState({ view: { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k } });
}

export function zoomToFit(): void {
  setState({ view: null });
}

/** 100%: one project pixel per screen pixel, centered. */
export function zoomToActual(): void {
  const { project } = getState();
  setState({ view: { scale: 1, x: (area.width - project.width) / 2, y: (area.height - project.height) / 2 } });
}

/** The artboard: drawn on, selected on, played back on. Zooms and pans like any canvas editor. */
export function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const tool = useEditor((s) => s.tool);
  const previewing = useEditor((s) => s.playhead !== null);
  const empty = useEditor((s) => s.project.steps.every((st) => st.strokes.length === 0));

  const draft = useRef<{ stroke: Stroke; start: number } | null>(null);
  const erasing = useRef<Set<string> | null>(null);
  const hover = useRef<[number, number] | null>(null);
  const hoverStroke = useRef<{ id: string; step: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current!;
    const measure = () => {
      const { width, height } = wrap.getBoundingClientRect();
      area = { width, height };
      setSize({ width, height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    const { project, current, onion, playhead, selection, tool, size: brushSize } = getState();
    const v = currentView();
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.x, dpr * v.y);

    // Paper lifted off the workspace (shadow sizes are in device pixels, unaffected by the transform).
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
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
      const [from] = editableRange(project, current);
      const stack: { stroke: Stroke; alpha: number }[] = [];
      project.steps.forEach((step, i) => {
        if (i < from || i > current + (onion ? 1 : 0)) return;
        if (i > current && step.newScene) return; // the next scene isn't on this canvas
        const alpha = i === current ? 1 : i < current ? (onion ? 0.25 : 1) : 0.08;
        for (const stroke of step.strokes) if (!erasing.current?.has(stroke.id)) stack.push({ stroke, alpha });
      });
      drawStack(ctx, stack);
      if (draft.current) drawLiveStroke(ctx, draft.current.stroke);
    }
    ctx.restore();

    const px = 1 / v.scale;
    const hovered = hoverStroke.current;
    if (playhead === null && tool === 'select' && hovered && !selection.has(hovered.id)) {
      const stroke = project.steps[hovered.step]?.strokes.find((s) => s.id === hovered.id);
      const hb = stroke && strokesBounds([stroke]);
      if (hb) {
        ctx.lineWidth = 1.5 * px;
        ctx.strokeStyle = 'rgba(91, 91, 214, 0.45)';
        ctx.strokeRect(hb.x - 4 * px, hb.y - 4 * px, hb.width + 8 * px, hb.height + 8 * px);
        // Strokes from earlier steps say where they live.
        if (hovered.step !== current) badge(ctx, `Step ${hovered.step + 1}`, hb.x - 4 * px, hb.y - 6 * px, px);
      }
    }

    const b = playhead === null ? selectionBounds(project, current, selection) : null;
    if (b) {
      const pad = SELECT_PAD * px;
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = PAPER_ACCENT;
      ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
      ctx.setLineDash([]);
      if (tool === 'select') {
        const h = HANDLE_SIZE * px;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x + b.width + pad - h / 2, b.y + b.height + pad - h / 2, h, h);
        ctx.strokeRect(b.x + b.width + pad - h / 2, b.y + b.height + pad - h / 2, h, h);
      }
    }

    const d = drag.current;
    if (d?.kind === 'marquee') {
      const [x0, y0] = d.start;
      const [x1, y1] = d.end;
      ctx.fillStyle = 'rgba(77, 124, 15, 0.1)';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.lineWidth = 1 * px;
      ctx.strokeStyle = 'rgba(77, 124, 15, 0.7)';
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    if (playhead === null && hover.current && (tool === 'pen' || tool === 'eraser')) {
      const [hx, hy] = hover.current;
      ctx.beginPath();
      ctx.arc(hx, hy, tool === 'eraser' ? ERASER_RADIUS : brushSize / 2, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = tool === 'eraser' ? '#868e96' : 'rgba(30,30,30,0.35)';
      ctx.stroke();
    }
  }, [size]);

  const requestPaint = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    paint();
  }, [size, paint]);

  useEffect(() => subscribe(requestPaint), [requestPaint]);

  // Trackpad/mouse wheel pans; pinch or Ctrl/⌘ + wheel zooms around the pointer.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025) * (e.ctrlKey && !e.metaKey ? 4 : 1)), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        const v = currentView();
        const k = e.deltaMode === 1 ? 16 : 1;
        setState({ view: { ...v, x: v.x - e.deltaX * k, y: v.y - e.deltaY * k } });
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const toProject = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = currentView();
    return [(e.clientX - rect.left - v.x) / v.scale, (e.clientY - rect.top - v.y) / v.scale];
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

  /** Topmost visible stroke under the point, from any step on the canvas. */
  const strokeAt = (x: number, y: number): { stroke: Stroke; step: number } | undefined => {
    const { project, current } = getState();
    const all = paintOrder(editableStrokes(project, current), (e) => e.stroke);
    const slop = HIT_SLOP / currentView().scale;
    for (let i = all.length - 1; i >= 0; i--) {
      if (distanceToStroke(all[i].stroke, x, y) <= all[i].stroke.size / 2 + slop) return all[i];
    }
  };

  /** Where the pointer is relative to the current selection. */
  const selectionHit = (x: number, y: number): 'handle' | 'inside' | null => {
    const { project, current, selection } = getState();
    const b = selectionBounds(project, current, selection);
    if (!b) return null;
    const scale = currentView().scale;
    const pad = SELECT_PAD / scale;
    const reach = HANDLE_SIZE / scale;
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
      drag.current = { kind: 'scale', anchor: [b.x, b.y], startDist: Math.max(1, Math.hypot(p[0] - b.x, p[1] - b.y)), base: project };
      return;
    }
    const found = strokeAt(...p);
    if (found && e.shiftKey) {
      const next = new Set(selection);
      if (next.has(found.stroke.id)) next.delete(found.stroke.id);
      else next.add(found.stroke.id);
      actions.setSelection(next);
      return;
    }
    if (found || hit === 'inside') {
      if (found && !selection.has(found.stroke.id)) actions.setSelection([found.stroke.id]);
      drag.current = { kind: 'move', start: p, base: getState().project };
      return;
    }
    if (!e.shiftKey) actions.clearSelection();
    drag.current = { kind: 'marquee', start: p, end: p, additive: e.shiftKey };
  };

  const moveDrag = (e: React.PointerEvent, p: [number, number]) => {
    const d = drag.current!;
    if (d.kind === 'pan') {
      setState({ view: { ...d.view, x: d.view.x + e.clientX - d.x, y: d.view.y + e.clientY - d.y } });
    } else if (d.kind === 'move') {
      const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
      d.map = (x, y) => [x + dx, y + dy];
      actions.transformSelection(d.base, d.map, 1, false);
    } else if (d.kind === 'scale') {
      const [ax, ay] = d.anchor;
      const k = Math.min(20, Math.max(0.05, Math.hypot(p[0] - ax, p[1] - ay) / d.startDist));
      d.k = k;
      actions.transformSelection(d.base, (x, y) => [ax + (x - ax) * k, ay + (y - ay) * k], k, false);
    } else {
      d.end = p;
    }
  };

  const endDrag = () => {
    const d = drag.current!;
    drag.current = null;
    if (d.kind === 'move' && d.map) actions.transformSelection(d.base, d.map, 1, true);
    if (d.kind === 'scale' && d.k) {
      const [ax, ay] = d.anchor;
      const k = d.k;
      actions.transformSelection(d.base, (x, y) => [ax + (x - ax) * k, ay + (y - ay) * k], k, true);
    }
    if (d.kind === 'marquee') {
      const [x0, x1] = [Math.min(d.start[0], d.end[0]), Math.max(d.start[0], d.end[0])];
      const [y0, y1] = [Math.min(d.start[1], d.end[1]), Math.max(d.start[1], d.end[1])];
      if (x1 - x0 < 2 && y1 - y0 < 2) return;
      const { project, current, selection } = getState();
      const inside = editableStrokes(project, current)
        .filter(({ stroke }) => stroke.points.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1))
        .map(({ stroke }) => stroke.id);
      actions.setSelection(d.additive ? [...selection, ...inside] : inside);
    }
  };

  const updateCursor = (p: [number, number]) => {
    const canvas = canvasRef.current!;
    const { tool, playhead } = getState();
    if (drag.current?.kind === 'pan') {
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (playhead !== null) canvas.style.cursor = 'default';
    else if (tool === 'hand') canvas.style.cursor = 'grab';
    else if (tool === 'pen') canvas.style.cursor = 'crosshair';
    else if (tool === 'eraser') canvas.style.cursor = 'none';
    else {
      const hit = selectionHit(...p);
      const found = strokeAt(...p);
      hoverStroke.current = found ? { id: found.stroke.id, step: found.step } : null;
      canvas.style.cursor = hit === 'handle' ? 'nwse-resize' : hit === 'inside' || found ? 'move' : 'default';
    }
  };

  const eraseAt = (x: number, y: number) => {
    const { project, current } = getState();
    for (const { stroke } of editableStrokes(project, current)) {
      if (distanceToStroke(stroke, x, y) <= ERASER_RADIUS + stroke.size / 2) erasing.current!.add(stroke.id);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { tool, color, gradient, size: brushSize, brush } = getState();
    const panning = e.button === 1 || (e.button === 0 && tool === 'hand');
    if (!size || (e.button !== 0 && !panning)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (panning) {
      e.preventDefault();
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, view: currentView() };
      updateCursor(toProject(e));
      return;
    }
    actions.exitPreview();
    if (tool === 'select') {
      startSelect(e);
      requestPaint();
      return;
    }
    actions.clearSelection();
    if (tool === 'pen') {
      draft.current = {
        start: e.timeStamp,
        stroke: { id: uid(), color, ...(gradient && { gradient }), size: brushSize, ...(brush !== 'marker' && { brush }), simulatePressure: e.pointerType !== 'pen', points: [] },
      };
      draft.current.stroke.points.push([...toProject(e), e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5, 0]);
    } else {
      erasing.current = new Set();
      eraseAt(...toProject(e));
    }
    requestPaint();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!size) return;
    hover.current = toProject(e);
    if (drag.current) {
      moveDrag(e, hover.current);
    } else if (draft.current) {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of events.length ? events : [e.nativeEvent]) addPoint(ev);
    } else if (erasing.current) {
      eraseAt(...hover.current);
    }
    updateCursor(hover.current);
    requestPaint();
  };

  const onPointerUp = () => {
    if (drag.current) endDrag();
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
    if (hover.current) updateCursor(hover.current);
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
    if (!asset || !size) return;
    e.preventDefault();
    actions.insertAsset(asset, ...toProject(e));
  };

  return (
    <div ref={wrapRef} className="relative h-full min-h-0 overflow-hidden bg-canvas">
      <canvas
        ref={canvasRef}
        className={cx('block touch-none', tool === 'eraser' && !previewing && 'cursor-none')}
        style={size ? { width: size.width, height: size.height } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onAuxClick={(e) => e.preventDefault()}
      />
      <CanvasHud />
      <ZoomControls />
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

/** Where you are: which scene and step you're drawing into, or that you're watching a preview. */
function CanvasHud() {
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const previewing = useEditor((s) => s.playhead !== null);
  const playing = useEditor((s) => s.playing);
  const step = project.steps[current];
  const scene = project.steps.slice(0, sceneStart(project, current) + 1).filter((s, i) => i === 0 || s.newScene).length;
  const scenes = project.steps.filter((s, i) => i === 0 || s.newScene).length;

  return (
    <div className="pointer-events-none absolute top-3 left-3 flex items-center">
        <span className="flex items-center gap-2 rounded-ctl bg-raised px-2.5 py-1 shadow-island">
        {previewing ? (
          <>
            <span className="font-medium text-accent">{playing ? 'Playing' : 'Preview'}</span>
            <span className="text-faint">Esc to edit</span>
          </>
        ) : (
          <>
            {scenes > 1 && <span className="text-muted">Scene {scene}</span>}
            <span className="font-medium">Step {current + 1}</span>
            <span className="-ml-1 text-faint">of {project.steps.length}</span>
            {step.label && (
              <>
                <span className="h-3 w-px bg-line-strong" />
                <span className="max-w-64 truncate text-muted">{step.label}</span>
              </>
            )}
          </>
        )}
      </span>
    </div>
  );
}

function ZoomControls() {
  const scale = useEditor((s) => (s.view ?? fitView(s.project)).scale);
  const fitted = useEditor((s) => s.view === null);
  return (
    <div className="absolute right-3 bottom-3 flex items-center rounded-ctl bg-raised p-0.5 shadow-island">
      <IconButton size="sm" title="Zoom out (Ctrl/⌘ −)" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
        <MinusIcon />
      </IconButton>
      <button className="h-7 w-12 rounded-ctl text-xs tabular-nums hover:bg-hover" title="Zoom to 100% (Shift 0)" onClick={zoomToActual}>
        {Math.round(scale * 100)}%
      </button>
      <IconButton size="sm" title="Zoom in (Ctrl/⌘ =)" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
        <PlusIcon />
      </IconButton>
      <IconButton size="sm" active={fitted} title="Fit to screen (Shift 1)" aria-label="Fit to screen" onClick={zoomToFit}>
        <FitIcon />
      </IconButton>
    </div>
  );
}

function selectionBounds(project: Project, current: number, selection: ReadonlySet<string>): Bounds | null {
  if (!selection.size) return null;
  return strokesBounds(editableStrokes(project, current).filter(({ stroke }) => selection.has(stroke.id)).map(({ stroke }) => stroke));
}

/** A small screen-sized label above a point, drawn in project coordinates. */
function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number) {
  ctx.save();
  ctx.font = `600 ${11 * px}px Inter Variable, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 12 * px;
  const h = 18 * px;
  ctx.fillStyle = PAPER_ACCENT;
  ctx.beginPath();
  ctx.roundRect(x, y - h, w, h, 4 * px);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 6 * px, y - h / 2);
  ctx.restore();
}
