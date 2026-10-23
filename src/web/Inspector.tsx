// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useEffect, useRef, useState } from 'react';
import { PALETTE, getTimeline, sceneStart, stepEndTime } from '../core';
import { CloseIcon, CopyIcon, DuplicateIcon, LeftIcon, RightIcon, SaveObjectIcon, TrashIcon } from './icons';
import { ColorEditor } from './ColorPicker';
import { LibraryPanel } from './LibraryPanel';
import { Slider } from './Slider';
import { actions, getState, setState, useEditor } from './store';
import { CommitInput, Field, IconButton, Section, Switch, TextButton, cx } from './ui';

export const CANVAS_PRESETS = [
  { label: '16:9 landscape', width: 1920, height: 1080 },
  { label: '9:16 vertical', width: 1080, height: 1920 },
  { label: '1:1 square', width: 1080, height: 1080 },
  { label: '4:5 portrait', width: 1080, height: 1350 },
  { label: '4:3 classic', width: 1440, height: 1080 },
] as const;

const BACKGROUNDS = [
  { color: '#f8f9fa', name: 'Off-white' },
  { color: '#ffffff', name: 'White' },
  { color: '#fdf6e3', name: 'Cream' },
  { color: '#e9dcc4', name: 'Kraft' },
  { color: '#eef3f8', name: 'Blueprint' },
  { color: '#2b3036', name: 'Slate' },
];

/** The right-hand panel: properties of what you're working on, and the object library. */
export function Inspector() {
  const panel = useEditor((s) => s.panel);
  const libraryCount = useEditor((s) => s.library.length);
  return (
    <aside className="flex w-[280px] min-h-0 flex-col border-l border-line bg-panel max-[1000px]:w-[248px]">
      <div className="flex h-10 shrink-0 items-end gap-4 border-b border-line px-3.5" role="tablist">
        {(['properties', 'library'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={panel === tab}
            className={cx('-mb-px h-9 border-b-2 font-medium capitalize transition-colors', panel === tab ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
            onClick={() => setState({ panel: tab })}
            title={tab === 'library' ? 'Saved objects (I)' : undefined}
          >
            {tab}
            {tab === 'library' && libraryCount > 0 && <span className="ml-1.5 text-xs font-normal text-faint tabular-nums">{libraryCount}</span>}
          </button>
        ))}
      </div>
      {panel === 'library' ? (
        <LibraryPanel />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <SelectionSection />
          <StepSection />
          <ProjectSection />
        </div>
      )}
    </aside>
  );
}

function SelectionSection() {
  const count = useEditor((s) => (s.playhead === null ? s.selection.size : 0));
  const color = useEditor((s) => s.color);
  const current = useEditor((s) => s.current);
  // Recomputed on every change; cheap next to drawing.
  const steps = useEditor((s) => (s.selection.size ? actions.selectionSteps().join(',') : ''));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!count) setNaming(false);
  }, [count]);
  useEffect(() => {
    if (naming) inputRef.current?.select();
  }, [naming]);

  if (!count) return null;
  const stepList = steps.split(',').map(Number);
  const elsewhere = stepList.some((i) => i !== current);

  const copy = async () => {
    const text = actions.selectionClipboard();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setState({ status: `Copied ${count} stroke${count === 1 ? '' : 's'}. Paste in any Retrace tab.` });
    } catch {
      setState({ status: 'Clipboard blocked by the browser. Use Ctrl/⌘ C instead.' });
    }
  };

  return (
    <Section
      className="bg-accent-soft/30"
      title={
        <span className="text-accent">
          Selection <span className="ml-1 font-normal tracking-normal normal-case tabular-nums">{count} stroke{count === 1 ? '' : 's'}</span>
        </span>
      }
      aside={
        <IconButton size="sm" title="Deselect (Esc)" aria-label="Deselect" onClick={actions.clearSelection}>
          <CloseIcon />
        </IconButton>
      }
    >
      <p className="text-xs text-muted">
        Drawn in step{stepList.length === 1 ? '' : 's'} {stepList.map((i) => i + 1).join(', ')}
        {elsewhere && (
          <button className="ml-1.5 font-medium text-accent hover:underline" onClick={actions.moveSelectionToCurrentStep} title="Move these strokes into the step you're editing, so they draw then">
            Move to step {current + 1}
          </button>
        )}
      </p>
      <Field label="Recolor">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={cx('size-5 rounded-full border-2 border-panel', color === c ? 'ring-2 ring-accent' : 'ring-1 ring-white/15')}
            style={{ background: c }}
            aria-label={`Recolor to ${c}`}
            onClick={() => actions.setColor(c)}
          />
        ))}
      </Field>
      {naming ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (actions.saveSelectionAsAsset(name)) setNaming(false);
          }}
        >
          <input
            ref={inputRef}
            className="h-7 min-w-0 flex-1 rounded-ctl bg-field px-2 outline-none select-text focus:ring-1 focus:ring-accent"
            value={name}
            aria-label="Object name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setNaming(false);
              }
            }}
          />
          <button type="submit" className="h-7 rounded-ctl bg-ink px-3 font-medium text-on-ink hover:bg-white">
            Save
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          <TextButton
            className="flex-1 bg-field font-medium"
            title="Save to your library to reuse in any project"
            onClick={() => {
              setName(`Object ${getState().library.length + 1}`);
              setNaming(true);
            }}
          >
            <SaveObjectIcon />
            Save as object
          </TextButton>
          <IconButton title="Copy (Ctrl/⌘ C): paste into any Retrace tab or project" aria-label="Copy" onClick={copy}>
            <CopyIcon />
          </IconButton>
          <IconButton tone="danger" title="Delete (⌫)" aria-label="Delete selection" onClick={actions.deleteSelection}>
            <TrashIcon />
          </IconButton>
        </div>
      )}
    </Section>
  );
}

function StepSection() {
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const step = project.steps[current];
  const timeline = getTimeline(project);
  const start = timeline.stepStarts[current];
  const drawing = stepEndTime(project, current) - start;
  const first = sceneStart(project, current);
  let last = current;
  while (last + 1 < project.steps.length && !project.steps[last + 1].newScene) last++;
  const sceneNumber = project.steps.slice(0, first + 1).filter((s, i) => i === 0 || s.newScene).length;

  return (
    <Section
      title={`Step ${current + 1} of ${project.steps.length}`}
      aside={
        <span className="flex gap-0.5">
          <IconButton size="sm" title="Previous step (←)" aria-label="Previous step" disabled={current === 0} onClick={() => actions.selectStep(current - 1)}>
            <LeftIcon />
          </IconButton>
          <IconButton size="sm" title="Next step (→)" aria-label="Next step" disabled={current === project.steps.length - 1} onClick={() => actions.selectStep(current + 1)}>
            <RightIcon />
          </IconButton>
        </span>
      }
    >
      <CommitInput key={step.id} value={step.label ?? ''} placeholder="Name this step…" aria-label="Step name" onCommit={(v) => actions.setLabel(v)} />
      <Field label="Hold" hint="Pause after this step finishes drawing">
        <Slider
          label="Hold after step"
          value={step.hold}
          min={0}
          max={8000}
          step={50}
          scale="pow"
          format={formatSeconds}
          marks={[{ value: 400 }, { value: 1000 }, { value: 2000 }, { value: 4000 }]}
          detents={[400, 1000, 2000, 4000]}
          defaultValue={400}
          onChange={(v) => actions.setHold(v, false)}
          onCommit={(v) => actions.setHold(v, true)}
        />
        <span className="w-10 shrink-0 text-right tabular-nums">{formatSeconds(step.hold)}</span>
      </Field>
      <Field label="Speed" hint="Playback speed for this step, on top of the project's hand speed. Speed up captions, slow down a reveal.">
        <Slider
          label="Step speed"
          value={step.speed ?? 1}
          min={0.25}
          max={8}
          step={0.05}
          scale="log"
          format={(v) => `${v.toFixed(2)}×`}
          marks={[{ value: 1 }, { value: 2 }, { value: 4 }]}
          detents={[1, 2, 4]}
          defaultValue={1}
          onChange={(v) => actions.setStepSpeed(v, false)}
          onCommit={(v) => actions.setStepSpeed(v, true)}
        />
        <span className="w-10 shrink-0 text-right tabular-nums">{(step.speed ?? 1).toFixed(step.speed && step.speed < 1 ? 2 : 1)}×</span>
      </Field>
      <Field label="New scene" hint="Wipe the canvas before this step draws">
        <Switch label="Starts a new scene" checked={!!step.newScene && current > 0} disabled={current === 0} onChange={actions.setNewScene} />
        <span className="text-xs text-faint">{current === 0 ? 'First step' : step.newScene ? 'Canvas wipes first' : 'Draws on top'}</span>
      </Field>
      <p className="pt-1 text-[11px] leading-relaxed text-muted">
        {step.strokes.length} stroke{step.strokes.length === 1 ? '' : 's'}, drawn in {formatSeconds(drawing)}, starting at {formatClock(start)}.
        <br />
        Scene {sceneNumber} {first === last ? `is step ${first + 1}` : `spans steps ${first + 1} to ${last + 1}`}.
      </p>
      <div className="flex gap-1">
        <TextButton className="flex-1 bg-field" title="Duplicate step" onClick={actions.duplicateStep}>
          <DuplicateIcon />
          Duplicate
        </TextButton>
        <IconButton title="Move step earlier ([)" aria-label="Move step earlier" disabled={current === 0} onClick={() => actions.moveStep(-1)}>
          <LeftIcon />
        </IconButton>
        <IconButton title="Move step later (])" aria-label="Move step later" disabled={current === project.steps.length - 1} onClick={() => actions.moveStep(1)}>
          <RightIcon />
        </IconButton>
        <IconButton tone="danger" title="Delete step (Shift ⌫)" aria-label="Delete step" onClick={() => actions.deleteStep()}>
          <TrashIcon />
        </IconButton>
      </div>
    </Section>
  );
}

function ProjectSection() {
  const project = useEditor((s) => s.project);
  const { duration } = getTimeline(project);
  const scenes = project.steps.filter((s, i) => i === 0 || s.newScene).length;
  const preset = CANVAS_PRESETS.find((p) => p.width === project.width && p.height === project.height);

  return (
    <Section title="Project" className="border-b-0">
      <Field label="Canvas">
        <select
          className="h-7 min-w-0 flex-1 rounded-ctl bg-field px-2 outline-none hover:bg-field-hover focus:ring-1 focus:ring-accent"
          value={preset ? `${preset.width}x${preset.height}` : 'custom'}
          aria-label="Canvas size"
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number);
            if (w && h) actions.setCanvasSize(w, h);
          }}
        >
          {CANVAS_PRESETS.map((p) => (
            <option key={p.label} value={`${p.width}x${p.height}`} title={p.label}>
              {p.label.split(' ')[0]} · {p.width}×{p.height}
            </option>
          ))}
          {!preset && <option value="custom">Custom · {project.width}×{project.height}</option>}
        </select>
      </Field>
      <Field label="Paper" top>
        <PaperPicker />
      </Field>
      <Field label="Hand speed" hint="How fast every stroke is redrawn, across the whole project">
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
        <span className="w-10 shrink-0 text-right tabular-nums">{project.speed.toFixed(2)}×</span>
      </Field>
      <p className="pt-1 text-[11px] text-muted">
        {formatClock(duration)} long, {scenes} scene{scenes === 1 ? '' : 's'}, {project.steps.length} step{project.steps.length === 1 ? '' : 's'}.
      </p>
    </Section>
  );
}

/** Paper presets, plus a full picker (opened inline, so the panel's scrolling never clips it) for any color. */
function PaperPicker() {
  const background = useEditor((s) => s.project.background);
  const [open, setOpen] = useState(false);
  const custom = !BACKGROUNDS.some((b) => b.color === background.toLowerCase());

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        {BACKGROUNDS.map((b) => (
          <button
            key={b.color}
            className={cx('size-5 shrink-0 rounded-ctl', background.toLowerCase() === b.color ? 'ring-2 ring-accent ring-offset-1 ring-offset-panel' : 'ring-1 ring-white/20')}
            style={{ background: b.color }}
            title={b.name}
            aria-label={`${b.name} paper`}
            onClick={() => actions.setBackground(b.color)}
          />
        ))}
        <button
          className={cx('grid size-5 shrink-0 place-items-center rounded-ctl p-[2px]', custom || open ? 'ring-2 ring-accent ring-offset-1 ring-offset-panel' : '')}
          style={{ background: 'conic-gradient(#e03131, #f59f00, #fcc419, #40c057, #22b8cf, #1c7ed6, #7950f2, #e64980, #e03131)' }}
          title="Any color"
          aria-label="Custom paper color"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="size-full rounded-[3px] border-[1.5px] border-panel" style={{ background }} />
        </button>
      </div>
      {open && (
        <div ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>
          <ColorEditor value={background} onChange={(hex, final) => actions.setBackground(hex, final)} />
        </div>
      )}
    </div>
  );
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)}s`;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
