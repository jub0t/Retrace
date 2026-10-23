// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FRAME_MS, getTimeline, sceneStart, stepEndTime, strokesBounds, type Project, type Stroke, type Timeline as Clock } from '../core';
import { FitIcon, FrameBackIcon, FrameForwardIcon, LoopIcon, MinusIcon, PauseIcon, PlayIcon, PlayStepIcon, PlusIcon, SceneIcon } from './icons';
import { formatClock, formatSeconds } from './Inspector';
import { drawBackground, drawStack } from './render';
import { readPref, writePref } from './storage';
import { actions, setState, useEditor } from './store';
import { IconButton, TextButton, cx } from './ui';

const PAD = 16;
const RULER_H = 24;
const SCENE_H = 22;
const TRANSPORT_H = 44;
/** Room under the track for the horizontal scrollbar. */
const BOTTOM_GAP = 14;
const MIN_TRACK_H = 46;
const DEFAULT_HEIGHT = 200;
const HEIGHT_KEY = 'retrace:timeline-height';
const CARD_W = 264;
/** Zoom limits, in pixels per millisecond (2 px/s .. 800 px/s). */
const MIN_PX = 0.002;
const MAX_PX = 0.8;
const TICK_STEPS = [100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000];

interface Block {
  index: number;
  start: number;
  /** When the strokes finish and the hold begins. */
  drawEnd: number;
  end: number;
}

interface Scene {
  number: number;
  first: number;
  last: number;
  start: number;
  end: number;
}

type Drag =
  | { kind: 'scrub' }
  | { kind: 'block'; index: number; startX: number; dx: number; moved: boolean }
  | { kind: 'hold'; index: number; startX: number; hold: number };

/**
 * A video-editor style timeline: a time ruler, scenes, and each step as a block as long as
 * it plays (solid while drawing, hatched while holding). Click to seek or pick a step, drag
 * a block to reorder, drag its right edge to change the hold, double-click to rename.
 */
export function Timeline() {
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const clock = getTimeline(project);
  const duration = Math.max(clock.duration, 1000);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null); // px per ms; null = fit
  const [drag, setDrag] = useState<Drag | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [height, setHeight] = useState(() => clampHeight(readPref(HEIGHT_KEY, DEFAULT_HEIGHT)));
  const trackH = height - TRANSPORT_H - RULER_H - 4 - SCENE_H - BOTTOM_GAP;

  // A smaller window shouldn't leave the timeline taller than the room it has.
  useEffect(() => {
    const onResize = () => setHeight((h) => clampHeight(h));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) => setHeight(clampHeight(startH - (ev.clientY - startY)));
    const up = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      writePref(HEIGHT_KEY, clampHeight(startH - (ev.clientY - startY)));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setViewport(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitPx = clamp((viewport - PAD * 2) / duration, MIN_PX, MAX_PX);
  const px = zoom ?? fitPx;
  const x = (t: number) => PAD + t * px;
  const timeAt = (clientX: number) => {
    const el = scrollRef.current!;
    return clamp((clientX - el.getBoundingClientRect().left + el.scrollLeft - PAD) / px, 0, clock.duration);
  };

  const blocks = layoutBlocks(project, clock);
  const scenes = layoutScenes(project, blocks);
  const time = playhead ?? stepEndTime(project, current);
  const width = Math.max(viewport, x(duration) + PAD + 120);

  // Keep the playhead in view while playing, and the current step in view while editing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = playhead !== null ? x(playhead) : x(blocks[current]?.start ?? 0);
    const right = playhead !== null ? target : x(blocks[current]?.end ?? 0);
    if (target < el.scrollLeft + 8 || right > el.scrollLeft + el.clientWidth - 8) {
      el.scrollLeft = Math.max(0, target - (playing ? el.clientWidth * 0.15 : 40));
    }
  }, [playhead !== null ? Math.floor(playhead / 250) : -1, current, px]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/⌘ + wheel zooms around the pointer; a plain vertical wheel scrolls sideways.
  useEffect(() => {
    const el = scrollRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const pointer = e.clientX - rect.left;
        const t = (pointer + el.scrollLeft - PAD) / pxRef.current;
        const next = clamp(pxRef.current * Math.exp(-e.deltaY * 0.004), MIN_PX, MAX_PX);
        setZoom(next);
        requestAnimationFrame(() => (el.scrollLeft = Math.max(0, PAD + t * next - pointer)));
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const pxRef = useRef(px);
  pxRef.current = px;

  const zoomBy = (factor: number) => {
    const el = scrollRef.current!;
    const center = (el.scrollLeft + el.clientWidth / 2 - PAD) / px;
    const next = clamp(px * factor, MIN_PX, MAX_PX);
    setZoom(next);
    requestAnimationFrame(() => (el.scrollLeft = Math.max(0, PAD + center * next - el.clientWidth / 2)));
  };

  /* ---- pointer gestures ---- */

  const startScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: 'scrub' });
    actions.scrub(snap(timeAt(e.clientX)));
  };

  const startBlock = (e: React.PointerEvent, index: number) => {
    if (e.button !== 0 || renaming !== null) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const hold = (e.target as HTMLElement).closest('[data-hold-handle]');
    if (hold) setDrag({ kind: 'hold', index, startX: e.clientX, hold: project.steps[index].hold });
    else setDrag({ kind: 'block', index, startX: e.clientX, dx: 0, moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'scrub') actions.scrub(snap(timeAt(e.clientX)));
    else if (drag.kind === 'hold') actions.setHold(drag.hold + (e.clientX - drag.startX) / px, false, drag.index);
    else {
      const dx = e.clientX - drag.startX;
      setDrag({ ...drag, dx, moved: drag.moved || Math.abs(dx) > 4 });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag(null);
    if (drag.kind === 'hold') actions.setHold(drag.hold + (e.clientX - drag.startX) / px, true, drag.index);
    if (drag.kind === 'block') {
      if (!drag.moved) actions.selectStep(drag.index);
      else {
        const slot = insertionSlot(blocks, timeAt(e.clientX));
        actions.moveStepTo(drag.index, slot > drag.index ? slot - 1 : slot);
      }
    }
  };

  const reorderSlot = drag?.kind === 'block' && drag.moved ? insertionSlot(blocks, clamp((x(blocks[drag.index].start) + drag.dx - PAD) / px, 0, clock.duration)) : null;

  return (
    <section className="relative flex shrink-0 flex-col border-t border-line bg-panel" style={{ height }} aria-label="Timeline">
      <div
        className="group absolute inset-x-0 -top-[5px] z-30 flex h-[9px] cursor-row-resize justify-center"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline"
        title="Drag to resize the timeline · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={() => {
          setHeight(clampHeight(DEFAULT_HEIGHT));
          writePref(HEIGHT_KEY, null);
        }}
      >
        <span className="mt-[3px] h-[3px] w-10 rounded-full bg-transparent transition-colors group-hover:bg-accent/60 group-active:bg-accent" />
      </div>
      {hovered !== null && hovered < blocks.length && !drag && renaming === null && (
        <StepPreview
          project={project}
          block={blocks[hovered]}
          left={clamp(x(blocks[hovered].start) - (scrollRef.current?.scrollLeft ?? 0), 8, Math.max(8, viewport - CARD_W - 8))}
        />
      )}
      <Transport time={time} duration={clock.duration} zoomed={zoom !== null} onZoom={zoomBy} onFit={() => setZoom(null)} />

      <div
        ref={scrollRef}
        className="relative overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="relative bg-lane" style={{ width, height: RULER_H + 4 + SCENE_H + trackH + BOTTOM_GAP - 4 }}>
          {/* Ruler: click or drag to scrub. */}
          <div className="absolute inset-x-0 top-0 cursor-ew-resize border-b border-line bg-panel" style={{ height: RULER_H }} onPointerDown={startScrub}>
            <Ruler px={px} duration={duration} width={width} />
          </div>

          {/* Scenes */}
          <div className="absolute inset-x-0" style={{ top: RULER_H + 4, height: SCENE_H }} onPointerDown={startScrub}>
            {scenes.map((s) => (
              <button
                key={s.first}
                className={cx(
                  'absolute top-0 flex h-full items-center gap-1 overflow-hidden rounded-t-ctl border-x border-t px-2 text-[11px] font-medium whitespace-nowrap',
                  current >= s.first && current <= s.last ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-panel text-muted hover:text-ink',
                )}
                style={{ left: x(s.start) + 1, width: Math.max(4, (s.end - s.start) * px - 2) }}
                title={`Scene ${s.number}: steps ${s.first + 1}–${s.last + 1}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => actions.selectStep(s.first)}
              >
                <SceneIcon />
                Scene {s.number}
              </button>
            ))}
          </div>

          {/* Steps */}
          <div className="absolute inset-x-0" style={{ top: RULER_H + 4 + SCENE_H, height: trackH }} onPointerDown={startScrub}>
            {blocks.map((b) => (
              <StepBlock
                trackH={trackH}
                key={project.steps[b.index].id}
                project={project}
                clock={clock}
                block={b}
                px={px}
                left={x(b.start)}
                active={b.index === current}
                dragging={drag?.kind === 'block' && drag.moved && drag.index === b.index ? drag.dx : null}
                renaming={renaming === b.index}
                onPointerDown={(e) => startBlock(e, b.index)}
                onHover={(on) => setHovered((h) => (on ? b.index : h === b.index ? null : h))}
                onRename={() => setRenaming(b.index)}
                onRenamed={(label) => {
                  setRenaming(null);
                  if (label !== null) actions.setLabel(label, b.index);
                }}
              />
            ))}
            {reorderSlot !== null && (
              <span
                className="pointer-events-none absolute -top-1 w-[3px] rounded-full bg-accent"
                style={{ left: x(reorderSlot < blocks.length ? blocks[reorderSlot].start : clock.duration) - 2, height: trackH + 2 }}
              />
            )}
          </div>

          {/* Playhead: where playback is, or where the current step finishes drawing. */}
          <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: x(time) }}>
            <span className={cx('absolute top-0 -left-[5px] h-[9px] w-[11px] [clip-path:polygon(0_0,100%_0,50%_100%)]', playhead !== null ? 'bg-accent' : 'bg-ink/50')} />
            <span className={cx('absolute top-0 bottom-0 -left-px w-[2px]', playhead !== null ? 'bg-accent' : 'bg-ink/30')} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Transport({ time, duration, zoomed, onZoom, onFit }: { time: number; duration: number; zoomed: boolean; onZoom: (f: number) => void; onFit: () => void }) {
  const playing = useEditor((s) => s.playing);
  const loop = useEditor((s) => s.loop);
  const previewing = useEditor((s) => s.playhead !== null);
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-line px-2" style={{ height: TRANSPORT_H }}>
      <button
        className="mr-1 grid size-7 shrink-0 place-items-center rounded-full bg-ink text-on-ink transition-colors hover:bg-white active:translate-y-px"
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={actions.togglePlay}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <IconButton title="Play from this step (Shift Space)" aria-label="Play from this step" onClick={actions.playFromCurrentStep}>
        <PlayStepIcon />
      </IconButton>
      <IconButton active={loop} aria-pressed={loop} title="Loop (L)" onClick={() => setState({ loop: !loop })}>
        <LoopIcon />
      </IconButton>
      <span className="mx-1.5 h-5 w-px bg-line" />
      <IconButton title="Previous frame (,) · Shift: 10 frames" aria-label="Previous frame" onClick={(e) => actions.stepFrame(e.shiftKey ? -10 : -1)}>
        <FrameBackIcon />
      </IconButton>
      <IconButton title="Next frame (.) · Shift: 10 frames" aria-label="Next frame" onClick={(e) => actions.stepFrame(e.shiftKey ? 10 : 1)}>
        <FrameForwardIcon />
      </IconButton>
      <span className="mx-2 inline-flex items-baseline gap-1 tabular-nums" title="Time · frame">
        <span className={cx('font-medium', previewing && 'text-accent')}>{formatClock(time)}</span>
        <span className="text-muted">/ {formatClock(duration)}</span>
        <span className="ml-1 rounded-ctl bg-field px-1.5 py-px text-[11px] text-muted max-[700px]:hidden">f{Math.round(time / FRAME_MS)}</span>
      </span>
      {previewing && (
        <TextButton className="h-6 text-muted" onClick={actions.exitPreview} title="Back to editing the current step (Esc)">
          Back to editing
        </TextButton>
      )}

      <div className="ml-auto flex items-center gap-1">
        <TextButton className="bg-field" title="New step after the current one (N)" onClick={actions.addStep}>
          <PlusIcon />
          Step
        </TextButton>
        <TextButton className="bg-field" title="New scene after the current step: starts on a clean canvas (Shift N)" onClick={actions.addScene}>
          <SceneIcon />
          Scene
        </TextButton>
        <span className="mx-1.5 h-5 w-px bg-line" />
        <IconButton size="sm" title="Zoom out timeline (Ctrl/⌘ scroll)" aria-label="Zoom out timeline" onClick={() => onZoom(1 / 1.5)}>
          <MinusIcon />
        </IconButton>
        <IconButton size="sm" active={!zoomed} title="Fit whole animation" aria-label="Fit timeline" onClick={onFit}>
          <FitIcon />
        </IconButton>
        <IconButton size="sm" title="Zoom in timeline (Ctrl/⌘ scroll)" aria-label="Zoom in timeline" onClick={() => onZoom(1.5)}>
          <PlusIcon />
        </IconButton>
      </div>
    </div>
  );
}

function StepBlock(props: {
  project: Project;
  clock: Clock;
  block: Block;
  px: number;
  left: number;
  active: boolean;
  /** Horizontal drag offset while being reordered. */
  dragging: number | null;
  renaming: boolean;
  trackH: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onHover: (on: boolean) => void;
  onRename: () => void;
  onRenamed: (label: string | null) => void;
}) {
  const { project, clock, block, px, left, active, dragging, renaming, trackH } = props;
  const step = project.steps[block.index];
  const w = Math.max(6, (block.end - block.start) * px - 2);
  const drawW = Math.min(w, Math.max(0, (block.drawEnd - block.start) * px));
  const ticks = w > 24 ? clock.strokes.filter((s) => s.step === block.index) : [];
  const name = step.label || (step.strokes.length ? '' : 'Empty');

  return (
    <div
      className={cx(
        'group absolute top-0 flex cursor-pointer overflow-hidden rounded-ctl border text-left transition-[box-shadow,opacity]',
        active ? 'z-10 border-accent' : 'border-line-strong hover:border-faint',
        dragging !== null && 'z-20 cursor-grabbing opacity-70 shadow-pop',
      )}
      style={{ left: left + 1, width: w, height: trackH, transform: dragging !== null ? `translateX(${dragging}px)` : undefined }}
      onPointerDown={props.onPointerDown}
      onPointerEnter={() => props.onHover(true)}
      onPointerLeave={() => props.onHover(false)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        props.onRename();
      }}
    >
      {/* Drawing time, with a tick where each stroke starts. */}
      <div className={cx('relative h-full shrink-0', active ? 'bg-accent-soft' : 'bg-field')} style={{ width: drawW }}>
        {ticks.map((s) => (
          <span key={s.stroke.id} className={cx('absolute bottom-0 h-2 w-px', active ? 'bg-accent/50' : 'bg-ink/20')} style={{ left: (s.start - block.start) * px }} />
        ))}
      </div>
      {/* Hold time. */}
      <div className="h-full min-w-0 flex-1 bg-raised" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-baseline gap-1.5 px-2 pt-1.5 whitespace-nowrap">
        <span className={cx('text-[11px] font-medium tabular-nums', active ? 'text-accent' : 'text-muted')}>{block.index + 1}</span>
        {!renaming && name && <span className={cx('truncate text-xs', step.label ? 'text-ink' : 'text-faint italic')}>{name}</span>}
      </div>
      {w >= 34 && trackH >= 56 && step.strokes.length > 0 && (
        <div className="pointer-events-none absolute right-2 bottom-2 left-1.5" style={{ top: 24 }}>
          <AddedThumb project={project} index={block.index} width={Math.min(w - 12, (trackH - 32) * 2.4)} height={trackH - 32} />
        </div>
      )}
      {renaming && (
        <input
          autoFocus
          defaultValue={step.label ?? ''}
          placeholder="Step name"
          className="absolute inset-x-1 top-1 h-6 rounded-ctl bg-field px-1.5 text-xs ring-1 ring-accent outline-none select-text"
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => props.onRenamed(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') props.onRenamed(null);
          }}
        />
      )}
      {step.newScene && block.index > 0 && <span className="absolute top-0 bottom-0 left-0 w-0.5 bg-accent" title="Starts a new scene" />}
      {/* Drag to change the hold. */}
      <span
        data-hold-handle
        className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize after:absolute after:top-1/2 after:right-[3px] after:h-5 after:w-[2px] after:-translate-y-1/2 after:rounded-full after:bg-ink/25 after:opacity-0 group-hover:after:opacity-100"
        title="Drag to change how long this step holds"
      />
    </div>
  );
}

/** Hovering a step: the frame as it looks when the step finishes, with what it adds at full strength. */
function StepPreview({ project, block, left }: { project: Project; block: Block; left: number }) {
  const step = project.steps[block.index];
  const scene = project.steps.slice(0, sceneStart(project, block.index) + 1).filter((s, i) => i === 0 || s.newScene).length;
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] z-40 animate-pop-in overflow-hidden rounded-panel bg-raised shadow-pop" style={{ left, width: CARD_W }}>
      <FrameThumb project={project} index={block.index} width={CARD_W} />
      <div className="border-t border-line px-3 pt-2 pb-2.5">
        <p className="truncate font-medium">
          <span className="mr-1.5 text-muted tabular-nums">{block.index + 1}</span>
          {step.label || <span className="text-faint italic">Unnamed step</span>}
        </p>
        <p className="mt-0.5 text-[11px] text-muted tabular-nums">
          Scene {scene}, starts at {formatClock(block.start)}. Draws for {formatSeconds(block.drawEnd - block.start)}, holds {formatSeconds(step.hold)}.
        </p>
        <p className="mt-1.5 text-[11px] text-faint">Drag to reorder. Drag the right edge to change the hold. Double-click to rename.</p>
      </div>
    </div>
  );
}

/** Steps are immutable, so identity tells whether a thumbnail's strokes changed. */
function sameSteps(a: { project: Project; index: number }, b: { project: Project; index: number }) {
  if (a.index !== b.index || a.project.background !== b.project.background || a.project.width !== b.project.width || a.project.height !== b.project.height) return false;
  const from = Math.min(sceneStart(a.project, a.index), sceneStart(b.project, b.index));
  for (let i = from; i <= a.index; i++) if (a.project.steps[i] !== b.project.steps[i]) return false;
  return true;
}

/** The whole frame at the end of a step: earlier strokes in the scene faint, this step's solid. */
const FrameThumb = memo(function FrameThumb({ project, index, width }: { project: Project; index: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round((width * project.height) / project.width);
  useEffect(() => {
    const ctx = setupCanvas(ref.current!, width, height, width / project.width);
    drawBackground(ctx, project);
    const from = sceneStart(project, index);
    const stack: { stroke: Stroke; alpha: number }[] = [];
    for (let i = from; i <= index; i++) for (const stroke of project.steps[i].strokes) stack.push({ stroke, alpha: i === index ? 1 : 0.3 });
    drawStack(ctx, stack);
  });
  return <canvas ref={ref} className="block" style={{ width, height }} />;
}, (a, b) => a.width === b.width && sameSteps(a, b));

/** Just the strokes a step adds, zoomed to fit, so a small block still shows what it draws. */
const AddedThumb = memo(function AddedThumb({ project, index, width, height }: { project: Project; index: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const strokes = project.steps[index].strokes;
    const b = strokesBounds(strokes);
    const canvas = ref.current!;
    if (!b) return;
    const pad = 6;
    const scale = Math.min((width - 4) / (b.width + pad * 2), (height - 2) / (b.height + pad * 2));
    const ctx = setupCanvas(canvas, width, height, 1);
    ctx.translate(2 + (width - 4 - (b.width + pad * 2) * scale) / 2, 1 + (height - 2 - (b.height + pad * 2) * scale) / 2);
    ctx.scale(scale, scale);
    ctx.translate(pad - b.x, pad - b.y);
    drawStack(ctx, strokes.map((stroke) => ({ stroke })));
  });
  // Strokes keep their own colours, so they sit on a scrap of paper rather than on the block.
  return <canvas ref={ref} className="block rounded-[3px] bg-paper" style={{ width, height }} />;
}, (a, b) => a.width === b.width && a.height === b.height && a.index === b.index && a.project.steps[a.index] === b.project.steps[b.index]);

/** Size a canvas for the screen's pixel density; returns a context drawing in `scale`d units. */
function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number, scale: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  return ctx;
}

/** Time ruler: labeled major ticks and lighter minor ticks, spaced to stay readable at any zoom. */
function Ruler({ px, duration, width }: { px: number; duration: number; width: number }) {
  const major = TICK_STEPS.find((s) => s * px >= 72) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const minor = major / 5 * px >= 9 ? major / 5 : major / 2;
  const end = (width - PAD) / px;
  const ticks: { t: number; major: boolean }[] = [];
  const perMajor = Math.round(major / minor);
  for (let k = 0; k * minor <= end; k++) ticks.push({ t: k * minor, major: k % perMajor === 0 });
  return (
    <svg className="absolute inset-0 overflow-visible text-muted" width={width} height={RULER_H} aria-hidden>
      {ticks.map(({ t, major: m }) => (
        <g key={t} transform={`translate(${PAD + t * px} 0)`} opacity={t > duration ? 0.4 : 1}>
          <line y1={m ? RULER_H - 10 : RULER_H - 5} y2={RULER_H} stroke="currentColor" strokeOpacity={0.5} strokeWidth={1} />
          {m && (
            <text x={3} y={12} fontSize={10.5} fill="currentColor" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatTick(t, major)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function layoutBlocks(project: Project, clock: Clock): Block[] {
  return project.steps.map((step, i) => {
    const start = clock.stepStarts[i];
    const end = clock.stepStarts[i + 1] ?? clock.duration;
    return { index: i, start, drawEnd: end - step.hold, end };
  });
}

function layoutScenes(project: Project, blocks: Block[]): Scene[] {
  const scenes: Scene[] = [];
  project.steps.forEach((step, i) => {
    if (i === 0 || step.newScene) scenes.push({ number: scenes.length + 1, first: i, last: i, start: blocks[i].start, end: blocks[i].end });
    const s = scenes[scenes.length - 1];
    s.last = i;
    s.end = blocks[i].end;
  });
  return scenes;
}

/** Index a dragged step would be inserted before, for a drop at time `t`. */
function insertionSlot(blocks: Block[], t: number): number {
  const i = blocks.findIndex((b) => t < (b.start + b.end) / 2);
  return i === -1 ? blocks.length : i;
}

function formatTick(t: number, major: number): string {
  const s = t / 1000;
  if (s >= 60) return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return major < 1000 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

/** Between a compact strip and whatever leaves the canvas and tool rail room to work. */
function clampHeight(h: number): number {
  const min = TRANSPORT_H + RULER_H + 4 + SCENE_H + MIN_TRACK_H + BOTTOM_GAP;
  return Math.round(clamp(Number(h) || DEFAULT_HEIGHT, min, Math.max(min, window.innerHeight - 48 - 400)));
}

const snap = (t: number) => Math.round(t / FRAME_MS) * FRAME_MS;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
