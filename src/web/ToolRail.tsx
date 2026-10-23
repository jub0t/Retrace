// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback, useMemo, useState } from 'react';
import { BRUSHES, BRUSH_STYLES, PALETTE, createRandom, shapeToStrokes, strokeOutlinePath, type BrushStyle } from '../core';
import { EraserIcon, HandIcon, OnionIcon, PenIcon, SelectIcon } from './icons';
import { PaintButton } from './ColorPicker';
import { Slider } from './Slider';
import { actions, setState, useEditor, type Tool } from './store';
import { IconButton, Popover, cx } from './ui';
import { usePopover } from './usePopover';

export const MIN_SIZE = 1;
export const MAX_SIZE = 48;

/** The vertical tool rail: what you draw with, and with which color. */
export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const color = useEditor((s) => s.color);
  const gradient = useEditor((s) => s.gradient);
  const onion = useEditor((s) => s.onion);

  return (
    <nav className="relative z-20 flex w-11 flex-col items-center gap-1 border-r border-line bg-panel py-2" aria-label="Tools">
      <RailTool tool="select" current={tool} title="Select (V): click any stroke you can see, Shift-click or drag a box; drag to move">
        <SelectIcon />
      </RailTool>
      <RailTool tool="pen" current={tool} title="Pen (P): draws into the current step">
        <PenIcon />
      </RailTool>
      <RailTool tool="eraser" current={tool} title="Eraser (E): erases any stroke you can see">
        <EraserIcon />
      </RailTool>
      <RailTool tool="hand" current={tool} title="Hand (H): drag to pan. Scroll pans too; pinch or Ctrl/⌘ scroll zooms">
        <HandIcon />
      </RailTool>
      <RailDivider />
      <BrushPicker />
      <RailDivider />
      <div className="grid grid-cols-2 place-items-center gap-1.5 py-0.5" role="radiogroup" aria-label="Color">
        {PALETTE.map((c, i) => (
          <button
            key={c}
            className={cx(
              'size-[18px] shrink-0 rounded-full border-2 border-panel',
              color === c && !gradient ? 'ring-2 ring-accent' : 'ring-1 ring-white/15',
            )}
            style={{ background: c }}
            role="radio"
            aria-checked={color === c && !gradient}
            aria-label={`Color ${i + 1}`}
            title={`Color (${i + 1})`}
            onClick={() => actions.setColor(c)}
          />
        ))}
      </div>
      <PaintButton side="right-end" />
      <RailDivider />
      <IconButton active={onion} aria-pressed={onion} title="Onion skin (O): dim earlier steps, ghost the next one" onClick={() => setState({ onion: !onion })}>
        <OnionIcon />
      </IconButton>
    </nav>
  );
}

function RailTool({ tool, current, title, children }: { tool: Tool; current: Tool; title: string; children: React.ReactNode }) {
  return (
    <IconButton active={tool === current} aria-pressed={tool === current} title={title} onClick={() => setState({ tool })}>
      {children}
    </IconButton>
  );
}

function RailDivider() {
  return <span className="my-1 h-px w-6 shrink-0 bg-line" />;
}

/**
 * One button showing the active brush and size. Opens a popover with brush styles
 * (each previewed with a real stroke), a precise size slider, and presets.
 */
function BrushPicker() {
  const brush = useEditor((s) => s.brush);
  const size = useEditor((s) => s.size);
  const color = useEditor((s) => s.color);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = usePopover<HTMLDivElement>(open, close);
  const dot = Math.min(20, Math.max(3, size));
  const presets = [...new Set([2, 4, 7, 12, 24, BRUSHES[brush].defaultSize])].sort((a, b) => a - b);

  return (
    <div className="relative" ref={ref}>
      <button
        className={cx(
          'flex h-10 w-8 flex-col items-center justify-center gap-0.5 rounded-ctl transition-colors duration-100',
          open ? 'bg-accent-soft text-accent' : 'hover:bg-hover',
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Brush: ${BRUSHES[brush].label}, ${fmtSize(size)}px (− / = to resize)`}
        onClick={() => setOpen(!open)}
      >
        <span className="grid size-5 place-items-center">
          <span className="block rounded-full bg-current" style={{ width: dot, height: dot, opacity: BRUSHES[brush].opacity }} />
        </span>
        <span className="text-[11px] leading-none tabular-nums">{fmtSize(size)}</span>
      </button>
      {open && (
        <Popover side="right" className="w-[316px]" role="dialog" aria-label="Brush">
          <div className="grid grid-cols-5 gap-1 border-b border-line pb-3" role="radiogroup" aria-label="Brush style">
            {BRUSH_STYLES.map((b) => (
              <button
                key={b}
                className={cx(
                  'flex flex-col items-center gap-1 rounded-ctl px-0.5 pt-1.5 pb-1 text-[11px] transition-colors',
                  brush === b ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-field',
                )}
                role="radio"
                aria-checked={brush === b}
                title={BRUSHES[b].description}
                onClick={() => actions.setBrush(b)}
              >
                <BrushSample brush={b} size={Math.min(BRUSHES[b].defaultSize, 14)} color={color} className="h-[22px]" />
                {BRUSHES[b].label}
              </button>
            ))}
          </div>
          <div className="mt-3 mb-1.5 flex justify-between px-0.5 text-xs font-medium text-muted">
            <span>{BRUSHES[brush].label} size</span>
            <span className="text-ink tabular-nums">{fmtSize(size)} px</span>
          </div>
          <BrushSample brush={brush} size={size} color={color} className="mb-1 h-16 rounded-ctl bg-paper" />
          <Slider
            label="Brush size"
            value={size}
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={0.5}
            scale="pow"
            format={(v) => `${fmtSize(v)} px`}
            marks={presets.map((v) => ({ value: v }))}
            detents={presets}
            defaultValue={BRUSHES[brush].defaultSize}
            onChange={actions.setSize}
          />
          <div className="mt-1.5 flex gap-1">
            {presets.map((v) => (
              <button
                key={v}
                className={cx(
                  'h-7 flex-1 rounded-ctl tabular-nums transition-colors',
                  size === v ? 'bg-accent-soft font-medium text-accent' : 'bg-field hover:bg-field-hover',
                )}
                aria-pressed={size === v}
                onClick={() => actions.setSize(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** A fixed squiggle drawn with the real brush engine, so previews match the canvas. */
function BrushSample({ brush, size, color, className }: { brush: BrushStyle; size: number; color: string; className?: string }) {
  const d = useMemo(() => {
    const [stroke] = shapeToStrokes(
      { type: 'curve', points: [[14, 34], [52, 14], [96, 40], [140, 16], [180, 30]] },
      { rand: createRandom(11), size, color, brush, wobble: 0.6 },
    );
    return strokeOutlinePath(stroke);
  }, [brush, size, color]);
  // Grow the viewBox for big nibs so the sample never clips.
  const pad = Math.max(0, size / 2 - 10);
  return (
    <svg className={cx('block w-full', className)} viewBox={`${-pad} ${-pad} ${194 + pad * 2} ${50 + pad * 2}`} aria-hidden>
      <path d={d} fill={color} fillOpacity={BRUSHES[brush].opacity} />
    </svg>
  );
}

const fmtSize = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
