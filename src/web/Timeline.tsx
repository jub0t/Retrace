// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  FRAME_MS,
  getTimeline,
  sceneAt,
  sceneOf,
  scenesOf,
  stepNumber,
  stepsShownWhileEditing,
  strokeZ,
  strokesBounds,
  trackIndex,
  tracksOf,
  type Project,
  type Stroke,
  type Timeline as Clock,
  type Track,
} from '../core';
import {
  EyeIcon,
  EyeOffIcon,
  FilmIcon,
  FitIcon,
  FrameBackIcon,
  FrameForwardIcon,
  LockIcon,
  LoopIcon,
  MinusIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  PlayStepIcon,
  PlusIcon,
  UnlockIcon,
} from './icons';
import { formatClock, formatSeconds } from './Inspector';
import { drawBackground, drawStack } from './render';
import { actions, getState, setState, useEditor } from './store';
import { MenuItem, MenuSeparator } from './TopBar';
import { Divider, IconButton, TextButton, cx } from './ui';
import { usePopover } from './usePopover';

const PAD = 12;
const RULER_H = 26;
const ROW_H = 52;
const HEADER_W = 176;
const CARD_W = 248;
const THUMB_H = 36;
/** Zoom limits, in pixels per millisecond (2 px/s .. 800 px/s). */
const MIN_PX = 0.002;
const MAX_PX = 0.8;
const TICK_STEPS = [100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000];

/** A step laid out in its scene: times are ms from the scene's start. */
interface Block {
  index: number;
  row: number;
  start: number;
  /** When the strokes finish and the hold begins. */
  drawEnd: number;
  end: number;
}

type Drag =
  | { kind: 'scrub' }
  | { kind: 'block'; index: number; startX: number; startY: number; dx: number; rows: number; moved: boolean }
  | { kind: 'hold'; index: number; startX: number; hold: number };

/**
 * The timeline: a strip of scenes, and below it the open scene's tracks. Each track is a
 * row that plays its steps in order, all rows starting with the scene; higher rows paint
 * on top. Drag a step along its row or onto another, drag its right edge to change the
 * hold, double-click empty space to add a step there.
 */
export function Timeline() {
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const clock = getTimeline(project);
  const tracks = tracksOf(project);
  // While previewing, follow the scene under the playhead; otherwise the one being edited.
  const sceneIndex = playhead !== null ? sceneAt(clock, playhead) : sceneOf(project, current).index;
  const scene = clock.scenes[sceneIndex];
  const length = scene.end - scene.start;
  const span = Math.max(length, 1000);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null); // px per ms; null = fit
  const [drag, setDrag] = useState<Drag | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setViewport(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitPx = clamp((viewport - PAD * 2) / span, MIN_PX, MAX_PX);
  const px = zoom ?? fitPx;
  const x = (t: number) => PAD + t * px;
  const timeAt = (clientX: number) => {
    const el = scrollRef.current!;
    return clamp((clientX - el.getBoundingClientRect().left + el.scrollLeft - PAD) / px, 0, length);
  };

  const blocks = layoutBlocks(project, clock, sceneIndex);
  const time = (playhead ?? clock.drawEnds[current]) - scene.start;
  const width = Math.max(viewport, x(span) + PAD + 120);
  const currentRow = tracks.length - 1 - trackIndex(project, project.steps[current]);

  // Keep the playhead in view while playing, and the current step in view while editing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const own = blocks.find((b) => b.index === current);
    const target = playhead !== null ? x(time) : x(own?.start ?? 0);
    const right = playhead !== null ? target : x(own?.end ?? 0);
    if (target < el.scrollLeft + 8 || right > el.scrollLeft + el.clientWidth - 8) {
      el.scrollLeft = Math.max(0, target - (playing ? el.clientWidth * 0.15 : 40));
    }
  }, [playhead !== null ? Math.floor(playhead / 250) : -1, current, px, sceneIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new scene starts fitted.
  useEffect(() => setZoom(null), [sceneIndex]);

  // Ctrl/⌘ + wheel zooms around the pointer; a plain vertical wheel scrolls sideways.
  const pxRef = useRef(px);
  pxRef.current = px;
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
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    const el = scrollRef.current!;
    const center = (el.scrollLeft + el.clientWidth / 2 - PAD) / px;
    const next = clamp(px * factor, MIN_PX, MAX_PX);
    setZoom(next);
    requestAnimationFrame(() => (el.scrollLeft = Math.max(0, PAD + center * next - el.clientWidth / 2)));
  };

  /* ---- pointer gestures ---- */

  const scrubTo = (clientX: number) => actions.scrub(snap(scene.start + timeAt(clientX)));

  const startScrub = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.detail > 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: 'scrub' });
    scrubTo(e.clientX);
  };

  const startBlock = (e: React.PointerEvent, b: Block) => {
    if (e.button !== 0 || renaming !== null) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const hold = (e.target as HTMLElement).closest('[data-hold-handle]');
    if (hold) setDrag({ kind: 'hold', index: b.index, startX: e.clientX, hold: project.steps[b.index].hold });
    else setDrag({ kind: 'block', index: b.index, startX: e.clientX, startY: e.clientY, dx: 0, rows: 0, moved: false });
  };

  /** Where a dragged block is, from the pointer: its offset, rows moved, and whether it moved at all. */
  const blockDrag = (d: Extract<Drag, { kind: 'block' }>, e: React.PointerEvent) => {
    const dx = e.clientX - d.startX;
    const b = blocks.find((k) => k.index === d.index)!;
    const rows = clamp(Math.round((e.clientY - d.startY) / ROW_H), -b.row, tracks.length - 1 - b.row);
    return { ...d, dx, rows, moved: d.moved || Math.abs(dx) > 4 || rows !== 0 };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'scrub') scrubTo(e.clientX);
    else if (drag.kind === 'hold') actions.setHold(drag.hold + (e.clientX - drag.startX) / px, false, drag.index);
    else {
      const next = blockDrag(drag, e);
      if (next.dx !== drag.dx || next.rows !== drag.rows || next.moved !== drag.moved) setDrag(next);
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag(null);
    if (drag.kind === 'hold') actions.setHold(drag.hold + (e.clientX - drag.startX) / px, true, drag.index);
    if (drag.kind === 'block') {
      const d = blockDrag(drag, e);
      if (!d.moved) return actions.selectStep(d.index);
      const b = blocks.find((k) => k.index === d.index)!;
      const target = tracks[tracks.length - 1 - (b.row + d.rows)];
      if (target.locked) return setState({ status: `${target.name} is locked` });
      actions.placeStep(d.index, target.id, snap(Math.max(0, b.start + d.dx / px)));
    }
  };

  const draggedBlock = drag?.kind === 'block' && drag.moved ? drag : null;
  const rows = [...tracks].reverse();

  return (
    <section className="relative flex max-h-[52vh] shrink-0 flex-col border-t border-line bg-panel" aria-label="Timeline">
      {hovered !== null && !drag && renaming === null && blocks.some((b) => b.index === hovered) && (
        <StepPreview
          project={project}
          block={blocks.find((b) => b.index === hovered)!}
          left={clamp(HEADER_W + x(blocks.find((b) => b.index === hovered)!.start) - (scrollRef.current?.scrollLeft ?? 0), 8, Math.max(8, HEADER_W + viewport - CARD_W - 8))}
        />
      )}
      <Transport time={time} length={length} zoomed={zoom !== null} onZoom={zoomBy} onFit={() => setZoom(null)} />
      <SceneStrip project={project} clock={clock} active={sceneIndex} />

      <div className="flex min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {/* Track headers, top of the stack first. */}
        <div className="z-10 shrink-0 border-r border-line bg-panel" style={{ width: HEADER_W }}>
          <div className="flex items-center justify-between border-b border-line pr-1.5 pl-3" style={{ height: RULER_H }}>
            <span className="text-xs font-medium text-muted">Tracks</span>
            <IconButton size="sm" className="size-6" title="New track" aria-label="New track" onClick={actions.addTrack}>
              <PlusIcon />
            </IconButton>
          </div>
          {rows.map((track, r) => (
            <TrackHeader key={track.id} track={track} active={r === currentRow} canDelete={tracks.length > 1} position={tracks.length - 1 - r} count={tracks.length} sceneFirst={scene.first} sceneLast={scene.last} />
          ))}
        </div>

        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setDrag(null)}
        >
          <div className="relative bg-lane" style={{ width, height: RULER_H + rows.length * ROW_H }}>
            {/* Ruler: click or drag to scrub. */}
            <div className="absolute inset-x-0 top-0 cursor-ew-resize border-b border-line bg-panel" style={{ height: RULER_H }} onPointerDown={startScrub}>
              <Ruler px={px} length={length} width={width} />
            </div>

            {/* Rows: click to scrub, double-click to add a step there. */}
            {rows.map((track, r) => (
              <div
                key={track.id}
                className={cx('absolute inset-x-0 border-b border-line', r === currentRow && 'bg-accent-soft/25', track.hidden && 'opacity-45')}
                style={{ top: RULER_H + r * ROW_H, height: ROW_H }}
                onPointerDown={startScrub}
                onDoubleClick={(e) => !track.locked && actions.addStepOnTrack(track.id, snap(timeAt(e.clientX)))}
                title={track.locked ? `${track.name} is locked` : 'Double-click to add a step here'}
              />
            ))}

            {blocks.map((b) => (
              <StepBlock
                key={project.steps[b.index].id}
                project={project}
                clock={clock}
                block={b}
                px={px}
                left={x(b.start)}
                top={RULER_H + b.row * ROW_H}
                number={stepNumber(project, b.index)}
                active={b.index === current}
                locked={!!tracks[tracks.length - 1 - b.row].locked}
                offset={draggedBlock?.index === b.index ? [draggedBlock.dx, draggedBlock.rows * ROW_H] : null}
                renaming={renaming === b.index}
                onPointerDown={(e) => startBlock(e, b)}
                onHover={(on) => setHovered((h) => (on ? b.index : h === b.index ? null : h))}
                onRename={() => setRenaming(b.index)}
                onRenamed={(label) => {
                  setRenaming(null);
                  if (label !== null) actions.setLabel(label, b.index);
                }}
              />
            ))}

            {/* Playhead: where playback is, or where the current step finishes drawing. */}
            <div className="pointer-events-none absolute top-0 bottom-0 z-20" style={{ left: x(time) }}>
              <span className={cx('absolute top-0 -left-[5px] h-[9px] w-[11px] [clip-path:polygon(0_0,100%_0,50%_100%)]', playhead !== null ? 'bg-accent' : 'bg-ink/50')} />
              <span className={cx('absolute top-0 bottom-0 -left-px w-[2px]', playhead !== null ? 'bg-accent' : 'bg-ink/30')} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Transport({ time, length, zoomed, onZoom, onFit }: { time: number; length: number; zoomed: boolean; onZoom: (f: number) => void; onFit: () => void }) {
  const playing = useEditor((s) => s.playing);
  const playAll = useEditor((s) => s.playAll);
  const loop = useEditor((s) => s.loop);
  const previewing = useEditor((s) => s.playhead !== null);
  const filmLength = useEditor((s) => getTimeline(s.project).duration);
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-3">
      <button
        className="mr-1 grid size-8 shrink-0 place-items-center rounded-full bg-ink text-on-ink transition-colors hover:bg-ink-hover active:translate-y-px"
        title={playing && !playAll ? 'Pause (Space)' : 'Play scene (Space)'}
        aria-label={playing && !playAll ? 'Pause' : 'Play scene'}
        onClick={actions.togglePlay}
      >
        {playing && !playAll ? <PauseIcon /> : <PlayIcon />}
      </button>
      <IconButton title="Play from this step (Shift Space)" aria-label="Play from this step" onClick={actions.playFromCurrentStep}>
        <PlayStepIcon />
      </IconButton>
      <IconButton active={loop} aria-pressed={loop} title="Loop (L)" onClick={() => setState({ loop: !loop })}>
        <LoopIcon />
      </IconButton>
      <Divider />
      <IconButton title="Previous frame (,)" aria-label="Previous frame" onClick={(e) => actions.stepFrame(e.shiftKey ? -10 : -1)}>
        <FrameBackIcon />
      </IconButton>
      <IconButton title="Next frame (.)" aria-label="Next frame" onClick={(e) => actions.stepFrame(e.shiftKey ? 10 : 1)}>
        <FrameForwardIcon />
      </IconButton>
      <span className="mx-2 inline-flex items-baseline gap-1 tabular-nums" title={`Frame ${Math.round(time / FRAME_MS)} of this scene`}>
        <span className={cx('font-medium', previewing && 'text-accent')}>{formatClock(time)}</span>
        <span className="text-faint">/ {formatClock(length)}</span>
      </span>
      {previewing && (
        <TextButton className="h-7 text-muted" onClick={actions.exitPreview} title="Back to editing the current step (Esc)">
          Edit
        </TextButton>
      )}

      <div className="ml-auto flex items-center gap-1">
        <TextButton active={playing && playAll} className={cx(!(playing && playAll) && 'bg-field')} title={`Play every scene (${formatClock(filmLength)})`} onClick={actions.togglePlayAll}>
          {playing && playAll ? <PauseIcon /> : <FilmIcon />}
          Play all
        </TextButton>
        <TextButton className="bg-field" title="New step after this one, on the same track (N)" onClick={actions.addStep}>
          <PlusIcon />
          Step
        </TextButton>
        <Divider />
        <IconButton size="sm" title="Zoom out (Ctrl/⌘ scroll)" aria-label="Zoom out timeline" onClick={() => onZoom(1 / 1.5)}>
          <MinusIcon />
        </IconButton>
        <IconButton size="sm" active={!zoomed} title="Fit the scene" aria-label="Fit timeline" onClick={onFit}>
          <FitIcon />
        </IconButton>
        <IconButton size="sm" title="Zoom in (Ctrl/⌘ scroll)" aria-label="Zoom in timeline" onClick={() => onZoom(1.5)}>
          <PlusIcon />
        </IconButton>
      </div>
    </div>
  );
}

/** Every scene as a card: pick one to work on it. */
function SceneStrip({ project, clock, active }: { project: Project; clock: Clock; active: number }) {
  const scenes = scenesOf(project);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ index: number; rect: DOMRect } | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <div className="flex h-[68px] shrink-0 items-center gap-2 overflow-x-auto border-b border-line px-3 [scrollbar-width:thin]">
      {scenes.map((s) => {
        const on = s.index === active;
        const timed = clock.scenes[s.index];
        return (
          <div
            key={project.steps[s.first].id}
            className={cx(
              'group relative flex h-12 shrink-0 cursor-pointer items-center gap-2.5 rounded-ctl py-1.5 pr-2 pl-1.5 transition-colors',
              on ? 'bg-accent-soft ring-1 ring-accent/50' : 'bg-field hover:bg-field-hover',
            )}
            onClick={() => !on && actions.selectScene(s.index)}
            onDoubleClick={() => setRenaming(s.index)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ index: s.index, rect: e.currentTarget.getBoundingClientRect() });
            }}
            title={s.name || `Scene ${s.index + 1}`}
          >
            <SceneThumb project={project} first={s.first} last={s.last} />
            <div className="flex w-[84px] min-w-0 flex-col">
              {renaming === s.index ? (
                <input
                  autoFocus
                  defaultValue={s.name ?? ''}
                  placeholder={`Scene ${s.index + 1}`}
                  className="-ml-1 h-6 rounded-[5px] bg-panel px-1 text-xs ring-1 ring-accent outline-none select-text"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    setRenaming(null);
                    actions.renameScene(s.index, e.currentTarget.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <span className={cx('truncate text-xs font-medium', on ? 'text-ink' : 'text-muted')}>{s.name || `Scene ${s.index + 1}`}</span>
              )}
              <span className="text-[11px] text-faint tabular-nums">{formatClock(timed.end - timed.start)}</span>
            </div>
            <button
              className={cx('grid size-6 shrink-0 place-items-center rounded-[5px] text-muted hover:bg-hover hover:text-ink [&_svg]:size-4', !on && 'opacity-0 group-hover:opacity-100')}
              aria-label={`Scene ${s.index + 1} actions`}
              onClick={(e) => {
                e.stopPropagation();
                setMenu({ index: s.index, rect: e.currentTarget.getBoundingClientRect() });
              }}
            >
              <MoreIcon />
            </button>
          </div>
        );
      })}
      <button
        className="grid h-12 w-10 shrink-0 place-items-center rounded-ctl bg-field text-muted transition-colors hover:bg-field-hover hover:text-ink"
        title="New scene (Shift N)"
        aria-label="New scene"
        onClick={actions.addScene}
      >
        <PlusIcon />
      </button>
      {menu && (
        <FloatingMenu anchor={menu.rect} onClose={close}>
          <MenuItem title="Rename" onClick={run(() => setRenaming(menu.index))} />
          <MenuItem title="Duplicate" onClick={run(() => actions.duplicateScene(menu.index))} />
          <MenuItem title="Move left" onClick={run(() => actions.moveScene(menu.index, menu.index - 1))} />
          <MenuItem title="Move right" onClick={run(() => actions.moveScene(menu.index, menu.index + 1))} />
          <MenuSeparator />
          <MenuItem danger title="Delete scene" onClick={run(() => actions.deleteScene(menu.index))} />
        </FloatingMenu>
      )}
    </div>
  );
}

/** A scene as it looks once it finishes. */
const SceneThumb = memo(
  function SceneThumb({ project, first, last }: { project: Project; first: number; last: number }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const width = Math.round((THUMB_H * project.width) / project.height);
    useEffect(() => {
      const ctx = setupCanvas(ref.current!, width, THUMB_H, THUMB_H / project.height);
      drawBackground(ctx, project);
      const tracks = tracksOf(project);
      const stack: { stroke: Stroke; z: number }[] = [];
      for (let i = first; i <= last; i++) {
        const track = trackIndex(project, project.steps[i]);
        if (tracks[track].hidden) continue;
        for (const stroke of project.steps[i].strokes) stack.push({ stroke, z: strokeZ(track, stroke) });
      }
      drawStack(ctx, stack);
    });
    return <canvas ref={ref} className="block shrink-0 rounded-[4px] shadow-[0_0_0_1px_var(--color-line-strong)]" style={{ width, height: THUMB_H }} />;
  },
  (a, b) => {
    if (a.first !== b.first || a.last !== b.last || a.project.background !== b.project.background || a.project.width !== b.project.width || a.project.height !== b.project.height) return false;
    if (a.project.tracks !== b.project.tracks) return false;
    for (let i = a.first; i <= a.last; i++) if (a.project.steps[i] !== b.project.steps[i]) return false;
    return true;
  },
);

function TrackHeader(props: { track: Track; active: boolean; canDelete: boolean; position: number; count: number; sceneFirst: number; sceneLast: number }) {
  const { track, active, canDelete, position, count } = props;
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  /** Draw on this track: pick its last step in the scene, or start one. */
  const pick = () => {
    const { project } = getState();
    for (let i = props.sceneLast; i >= props.sceneFirst; i--) {
      if (tracksOf(project)[trackIndex(project, project.steps[i])].id === track.id) return actions.selectStep(i);
    }
    if (!track.locked) actions.addStepOnTrack(track.id);
  };

  return (
    <div
      className={cx('group relative flex cursor-pointer items-center gap-0.5 border-b border-line pr-1 pl-3', active ? 'bg-accent-soft/40' : 'hover:bg-hover')}
      style={{ height: ROW_H }}
      onClick={pick}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent" />}
      {renaming ? (
        <input
          autoFocus
          defaultValue={track.name}
          className="-ml-1 h-7 min-w-0 flex-1 rounded-[5px] bg-field px-1.5 ring-1 ring-accent outline-none select-text"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            setRenaming(false);
            actions.updateTrack(track.id, { name: e.currentTarget.value });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <span
          className={cx('min-w-0 flex-1 truncate', active ? 'font-medium text-ink' : 'text-muted', track.hidden && 'line-through')}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setRenaming(true);
          }}
          title="Double-click to rename"
        >
          {track.name}
        </span>
      )}
      <TrackToggle on={!!track.hidden} label={track.hidden ? 'Show track' : 'Hide track'} onClick={() => actions.updateTrack(track.id, { hidden: !track.hidden })}>
        {track.hidden ? <EyeOffIcon /> : <EyeIcon />}
      </TrackToggle>
      <TrackToggle on={!!track.locked} label={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => actions.updateTrack(track.id, { locked: !track.locked })}>
        {track.locked ? <LockIcon /> : <UnlockIcon />}
      </TrackToggle>
      <TrackToggle on={!!menu} label="Track actions" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
        <MoreIcon />
      </TrackToggle>
      {menu && (
        <FloatingMenu anchor={menu} onClose={close}>
          <MenuItem title="Rename" onClick={run(() => setRenaming(true))} />
          <MenuItem title="Add a step" onClick={run(() => actions.addStepOnTrack(track.id))} />
          <MenuItem title="Move up" onClick={run(() => position < count - 1 && actions.moveTrack(track.id, 1))} />
          <MenuItem title="Move down" onClick={run(() => position > 0 && actions.moveTrack(track.id, -1))} />
          {canDelete && (
            <>
              <MenuSeparator />
              <MenuItem danger title="Delete track" onClick={run(() => actions.deleteTrack(track.id))} />
            </>
          )}
        </FloatingMenu>
      )}
    </div>
  );
}

/** Eye, lock and menu buttons: quiet until the row is hovered, unless they're switched on. */
function TrackToggle({ on, label, onClick, children }: { on: boolean; label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: ReactNode }) {
  return (
    <button
      className={cx(
        'grid size-7 shrink-0 place-items-center rounded-[6px] transition-[color,opacity] hover:bg-field [&_svg]:size-4',
        on ? 'text-ink' : 'text-faint opacity-0 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100',
      )}
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      {children}
    </button>
  );
}

/** A menu pinned above an anchor, outside any scrolling container that would clip it. */
function FloatingMenu({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: ReactNode }) {
  const ref = usePopover<HTMLDivElement>(true, onClose);
  const left = clamp(anchor.left, 8, window.innerWidth - 208);
  return (
    <div
      ref={ref}
      className="fixed z-50 flex w-50 animate-pop-in flex-col rounded-panel bg-raised p-1.5 shadow-pop"
      style={{ left, bottom: window.innerHeight - anchor.top + 6 }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function StepBlock(props: {
  project: Project;
  clock: Clock;
  block: Block;
  px: number;
  left: number;
  top: number;
  number: number;
  active: boolean;
  locked: boolean;
  /** Drag offset while being moved: [x, y] in pixels. */
  offset: [number, number] | null;
  renaming: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onHover: (on: boolean) => void;
  onRename: () => void;
  onRenamed: (label: string | null) => void;
}) {
  const { project, clock, block, px, left, top, active, locked, offset, renaming } = props;
  const step = project.steps[block.index];
  const w = Math.max(6, (block.end - block.start) * px - 2);
  const drawW = Math.min(w, Math.max(0, (block.drawEnd - block.start) * px));
  const h = ROW_H - 10;
  const ticks = w > 24 ? clock.strokes.filter((s) => s.step === block.index) : [];
  const thumbW = Math.min(w - 10, 56);
  const showThumb = w >= 84 && step.strokes.length > 0;

  return (
    <div
      className={cx(
        'group absolute z-10 flex overflow-hidden rounded-[7px] text-left shadow-[0_0_0_1px_var(--color-line-strong)] transition-[box-shadow,opacity]',
        active && 'z-[15] shadow-[0_0_0_1.5px_var(--color-accent)]',
        locked ? 'cursor-default' : 'cursor-grab',
        offset && 'z-30 cursor-grabbing opacity-80 shadow-pop',
      )}
      style={{ left: left + 1, top: top + 5, width: w, height: h, transform: offset ? `translate(${offset[0]}px, ${offset[1]}px)` : undefined }}
      onPointerDown={props.onPointerDown}
      onPointerEnter={() => props.onHover(true)}
      onPointerLeave={() => props.onHover(false)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        props.onRename();
      }}
    >
      {/* Drawing time, with a tick where each stroke starts. */}
      <div className={cx('relative h-full shrink-0', active ? 'bg-accent-soft' : 'bg-raised')} style={{ width: drawW }}>
        {ticks.map((s) => (
          <span key={s.stroke.id} className={cx('absolute bottom-0 h-1.5 w-px', active ? 'bg-accent/60' : 'bg-ink/20')} style={{ left: (s.start - clock.stepStarts[block.index]) * px }} />
        ))}
      </div>
      {/* Hold time, hatched. */}
      <div className="h-full min-w-0 flex-1 bg-panel bg-[repeating-linear-gradient(135deg,var(--color-line)_0_2px,transparent_2px_7px)]" />
      <div className="pointer-events-none absolute inset-0 flex items-center gap-2 px-1.5">
        {showThumb && <AddedThumb project={project} index={block.index} width={thumbW} height={h - 10} />}
        <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
          <span className={cx('text-[11px] font-semibold tabular-nums', active ? 'text-accent' : 'text-faint')}>{props.number}</span>
          {!renaming && w > 40 && <span className={cx('truncate text-xs', step.label ? 'text-ink' : 'text-faint')}>{step.label || (step.strokes.length ? '' : 'Empty')}</span>}
        </div>
      </div>
      {renaming && (
        <input
          autoFocus
          defaultValue={step.label ?? ''}
          placeholder="Step name"
          className="absolute inset-x-1 top-1/2 h-7 -translate-y-1/2 rounded-[5px] bg-panel px-1.5 text-xs ring-1 ring-accent outline-none select-text"
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => props.onRenamed(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') props.onRenamed(null);
          }}
        />
      )}
      {/* Drag to change the hold. */}
      {!locked && (
        <span
          data-hold-handle
          className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize after:absolute after:top-1/2 after:right-[3px] after:h-4 after:w-[2px] after:-translate-y-1/2 after:rounded-full after:bg-ink/30 after:opacity-0 group-hover:after:opacity-100"
          title="Drag to change the hold"
        />
      )}
    </div>
  );
}

/** Hovering a step: the frame as it looks when the step finishes, with what it adds at full strength. */
function StepPreview({ project, block, left }: { project: Project; block: Block; left: number }) {
  const step = project.steps[block.index];
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] z-40 animate-pop-in overflow-hidden rounded-panel bg-raised shadow-pop" style={{ left, width: CARD_W }}>
      <FrameThumb project={project} index={block.index} width={CARD_W} />
      <div className="border-t border-line px-3 py-2.5">
        <p className="truncate font-medium">
          <span className="mr-1.5 text-faint tabular-nums">{stepNumber(project, block.index)}</span>
          {step.label || <span className="text-faint">Untitled step</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted tabular-nums">
          {formatClock(block.start)} · draws {formatSeconds(block.drawEnd - block.start)} · holds {formatSeconds(step.hold)}
        </p>
      </div>
    </div>
  );
}

/** The whole frame at the end of a step: what else is up by then faint, this step's strokes solid. */
const FrameThumb = memo(function FrameThumb({ project, index, width }: { project: Project; index: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round((width * project.height) / project.width);
  useEffect(() => {
    const ctx = setupCanvas(ref.current!, width, height, width / project.width);
    drawBackground(ctx, project);
    const stack: { stroke: Stroke; alpha: number; z: number }[] = [];
    for (const i of stepsShownWhileEditing(project, index)) {
      const track = trackIndex(project, project.steps[i]);
      for (const stroke of project.steps[i].strokes) stack.push({ stroke, alpha: i === index ? 1 : 0.3, z: strokeZ(track, stroke) });
    }
    drawStack(ctx, stack);
  });
  return <canvas ref={ref} className="block" style={{ width, height }} />;
});

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
  return <canvas ref={ref} className="block shrink-0 rounded-[4px] bg-paper" style={{ width, height }} />;
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
function Ruler({ px, length, width }: { px: number; length: number; width: number }) {
  const major = TICK_STEPS.find((s) => s * px >= 72) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const minor = (major / 5) * px >= 9 ? major / 5 : major / 2;
  const end = (width - PAD) / px;
  const ticks: { t: number; major: boolean }[] = [];
  const perMajor = Math.round(major / minor);
  for (let k = 0; k * minor <= end; k++) ticks.push({ t: k * minor, major: k % perMajor === 0 });
  return (
    <svg className="absolute inset-0 overflow-visible text-muted" width={width} height={RULER_H} aria-hidden>
      {ticks.map(({ t, major: m }) => (
        <g key={t} transform={`translate(${PAD + t * px} 0)`} opacity={t > length ? 0.35 : 1}>
          <line y1={m ? RULER_H - 9 : RULER_H - 4} y2={RULER_H} stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} />
          {m && (
            <text x={4} y={13} fontSize={10.5} fill="currentColor" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatTick(t, major)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** The scene's steps, each on its track's row (row 0 is the top track), in ms from the scene's start. */
function layoutBlocks(project: Project, clock: Clock, sceneIndex: number): Block[] {
  const { first, last, start } = clock.scenes[sceneIndex];
  const top = tracksOf(project).length - 1;
  const blocks: Block[] = [];
  for (let i = first; i <= last; i++) {
    blocks.push({
      index: i,
      row: top - trackIndex(project, project.steps[i]),
      start: clock.stepStarts[i] - start,
      drawEnd: clock.drawEnds[i] - start,
      end: clock.stepEnds[i] - start,
    });
  }
  return blocks;
}

function formatTick(t: number, major: number): string {
  const s = t / 1000;
  if (s >= 60) return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return major < 1000 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

const snap = (t: number) => Math.round(t / FRAME_MS) * FRAME_MS;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
