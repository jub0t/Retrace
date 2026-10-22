import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { distanceToStroke, strokesBounds, uid, type Stroke } from '../core';
import { drawBackground, drawFrame, drawLiveStroke, drawStroke } from './render';
import { actions, getState, subscribe, useEditor } from './store';
import { Kbd, cx } from './ui';

const PADDING = 32;
/** Room for the floating menu bar and toolbar, so they never cover the artboard. */
const TOP_CHROME = 64;
const ERASER_RADIUS = 14;

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

    if (playhead === null && selection.size) {
      const b = strokesBounds(project.steps[current].strokes.filter((s) => selection.has(s.id)));
      if (b) {
        const pad = 8 / layout.scale;
        ctx.setLineDash([6 / layout.scale, 4 / layout.scale]);
        ctx.lineWidth = 1.5 / layout.scale;
        ctx.strokeStyle = '#5b5bd6';
        ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
        ctx.setLineDash([]);
      }
    }

    if (playhead === null && hover.current) {
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
    actions.clearSelection();
    e.currentTarget.setPointerCapture(e.pointerId);
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
    if (draft.current) {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of events.length ? events : [e.nativeEvent]) addPoint(ev);
    } else if (erasing.current) {
      eraseAt(...hover.current);
    }
    requestPaint();
  };

  const onPointerUp = () => {
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
    requestPaint();
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className={cx('block touch-none', previewing ? 'cursor-default' : tool === 'pen' ? 'cursor-crosshair' : 'cursor-none')}
        style={layout ? { width: layout.width, height: layout.height } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
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
