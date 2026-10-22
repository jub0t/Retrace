// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { memo, useEffect, useRef, useState } from 'react';
import { FRAME_MS, getTimeline, stepAt, stepEndTime, type Project } from '../core';
import { FrameBackIcon, FrameForwardIcon, LeftIcon, LoopIcon, PauseIcon, PlayIcon, PlayStepIcon, PlusIcon, RightIcon, TrashIcon } from './icons';
import { drawBackground, drawStroke } from './render';
import { Slider } from './Slider';
import { actions, setState, useEditor } from './store';
import { IconButton, Island, cx } from './ui';

const THUMB_W = 96;

/** Aseprite-style bottom panel: transport + scrubber, one cell per step, and an inspector. */
export function Timeline() {
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const playing = useEditor((s) => s.playing);
  const playhead = useEditor((s) => s.playhead);
  const loop = useEditor((s) => s.loop);
  const timeline = getTimeline(project);
  const active = playhead !== null ? stepAt(timeline, playhead) : current;
  // While editing, the scrubber sits where the current step finishes drawing.
  const time = playhead ?? stepEndTime(project, current);

  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.children[active]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  return (
    <Island className="mx-3 mb-3 grid grid-cols-[minmax(0,1fr)_300px] gap-x-4 gap-y-1.5 px-3 pt-2 pb-2.5 [grid-template-areas:'transport_inspector'_'strip_inspector'] max-[860px]:grid-cols-1 max-[860px]:[grid-template-areas:'transport'_'strip'_'inspector']">
      <div className="flex min-w-0 items-center gap-0.5 [grid-area:transport]">
        <button
          className="mr-1 grid size-[38px] shrink-0 place-items-center rounded-full bg-accent text-white shadow-[0_2px_6px_rgb(91_91_214/0.35)] transition-colors hover:bg-accent-strong active:translate-y-px"
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
        <span className="mx-1.5 h-5 w-px shrink-0 bg-line" />
        <IconButton title="Previous frame (,) · Shift: 10 frames" aria-label="Previous frame" onClick={(e) => actions.stepFrame(e.shiftKey ? -10 : -1)}>
          <FrameBackIcon />
        </IconButton>
        <IconButton title="Next frame (.) · Shift: 10 frames" aria-label="Next frame" onClick={(e) => actions.stepFrame(e.shiftKey ? 10 : 1)}>
          <FrameForwardIcon />
        </IconButton>
        <span className="mr-3 ml-2 inline-flex shrink-0 items-baseline gap-0.5 tabular-nums" title="Time · frame">
          <span className={cx('font-semibold', playhead !== null && 'text-accent')}>{formatTime(time)}</span>
          <span className="text-muted"> / {formatTime(timeline.duration)}</span>
          <span className="ml-2 rounded-[5px] bg-hover px-1.5 py-px text-[11px] text-muted max-[860px]:hidden">f{Math.round(time / FRAME_MS)}</span>
        </span>
        <Slider
          className="mr-1"
          variant="scrubber"
          label="Playhead"
          value={time}
          min={0}
          max={Math.max(FRAME_MS, timeline.duration)}
          step={FRAME_MS}
          format={(t) => `${formatTime(t)} · f${Math.round(t / FRAME_MS)}`}
          marks={timeline.stepStarts.slice(1).map((t) => ({ value: t }))}
          onChange={actions.scrub}
        />
      </div>

      <div ref={stripRef} className="flex min-w-0 gap-2 overflow-x-auto px-[3px] pt-1 pb-1.5 [scrollbar-width:thin] [grid-area:strip]">
        {project.steps.map((s, i) => (
          <button
            key={s.id}
            className={cx(
              'relative shrink-0 rounded-lg border-2 leading-none transition-shadow',
              i === active ? 'border-accent shadow-[0_2px_8px_rgb(91_91_214/0.25)]' : 'border-transparent ring-1 ring-line hover:ring-faint',
            )}
            aria-current={i === active}
            title={s.label ? `${i + 1}: ${s.label}` : `Step ${i + 1}`}
            onClick={() => actions.selectStep(i)}
          >
            <StepThumb project={project} index={i} />
            <span
              className={cx(
                'absolute bottom-1 left-1 rounded px-1.5 text-[10px] leading-[14px] font-semibold',
                i === active ? 'bg-accent text-white' : 'bg-white/90 text-muted',
              )}
            >
              {i + 1}
            </span>
          </button>
        ))}
        <button
          className="grid w-14 shrink-0 place-items-center rounded-lg border-[1.5px] border-dashed border-[#cfd3d9] text-faint transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
          title="New step after current (N)"
          aria-label="New step"
          onClick={actions.addStep}
        >
          <PlusIcon />
        </button>
      </div>

      <Inspector />
    </Island>
  );
}

function Inspector() {
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const step = project.steps[current];

  return (
    <div className="flex flex-col gap-1.5 border-l border-line pl-4 [grid-area:inspector] max-[860px]:border-t max-[860px]:border-l-0 max-[860px]:pt-2 max-[860px]:pl-0">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">
          Step {current + 1} of {project.steps.length}
        </span>
        <span className="flex gap-0.5">
          <IconButton size="sm" title="Move step left ([)" aria-label="Move step left" onClick={() => actions.moveStep(-1)} disabled={current === 0}>
            <LeftIcon />
          </IconButton>
          <IconButton size="sm" title="Move step right (])" aria-label="Move step right" onClick={() => actions.moveStep(1)} disabled={current === project.steps.length - 1}>
            <RightIcon />
          </IconButton>
          <IconButton size="sm" tone="danger" title="Delete step (Shift Backspace)" aria-label="Delete step" onClick={actions.deleteStep}>
            <TrashIcon />
          </IconButton>
        </span>
      </div>
      <LabelInput key={step.id} value={step.label ?? ''} />
      <FieldRow label="Hold" value={formatSeconds(step.hold)}>
        <Slider
          label="Hold after step"
          value={step.hold}
          min={0}
          max={5000}
          step={50}
          scale="pow"
          format={formatSeconds}
          marks={[{ value: 400 }, { value: 1000 }, { value: 2000 }]}
          detents={[400, 1000, 2000]}
          defaultValue={400}
          onChange={(v) => actions.setHold(v, false)}
          onCommit={(v) => actions.setHold(v, true)}
        />
      </FieldRow>
      <FieldRow label="Speed" value={`${project.speed.toFixed(2)}×`}>
        <Slider
          label="Drawing speed"
          value={project.speed}
          min={0.25}
          max={4}
          step={0.05}
          scale="log"
          format={(v) => `${v.toFixed(2)}×`}
          marks={[{ value: 0.5 }, { value: 1 }, { value: 2 }]}
          detents={[0.5, 1, 2]}
          defaultValue={1}
          onChange={(v) => actions.setSpeed(v, false)}
          onCommit={(v) => actions.setSpeed(v, true)}
        />
      </FieldRow>
    </div>
  );
}

function FieldRow({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[42px] shrink-0 text-muted">{label}</span>
      {children}
      <span className="w-12 shrink-0 text-right tabular-nums">{value}</span>
    </div>
  );
}

/** Edits locally; commits on Enter or blur so typing is a single undo step. */
function LabelInput({ value }: { value: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="h-8 rounded-lg border border-line bg-[#fafbfc] px-2.5 outline-none transition select-text placeholder:text-faint hover:border-[#d3d7dd] focus:border-accent focus:bg-white focus:ring-3 focus:ring-accent/15"
      value={draft}
      placeholder="Name this step…"
      aria-label="Step label"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => actions.setLabel(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

/** Earlier steps faint, this step's strokes solid: shows what the step adds. */
const StepThumb = memo(
  function StepThumb({ project, index }: { project: Project; index: number }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const height = Math.round((THUMB_W * project.height) / project.width);

    // Runs only when memo lets a render through, i.e. when this thumbnail's steps changed.
    useEffect(() => {
      const canvas = ref.current!;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = THUMB_W * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d')!;
      const scale = (THUMB_W * dpr) / project.width;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawBackground(ctx, project);
      project.steps.slice(0, index + 1).forEach((step, i) => {
        ctx.globalAlpha = i === index ? 1 : 0.18;
        step.strokes.forEach((s) => drawStroke(ctx, s));
      });
    });

    return <canvas ref={ref} className="block rounded-md" style={{ width: THUMB_W, height }} />;
  },
  // Steps are immutable, so identity tells us whether steps 0..index changed.
  (a, b) =>
    a.index === b.index &&
    a.project.width === b.project.width &&
    a.project.height === b.project.height &&
    a.project.background === b.project.background &&
    a.project.steps.slice(0, a.index + 1).every((step, i) => step === b.project.steps[i]),
);

function formatTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)}s`;
}
