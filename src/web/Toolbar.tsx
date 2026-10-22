// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback, useMemo, useState } from 'react';
import { BRUSHES, BRUSH_STYLES, PALETTE, createRandom, shapeToStrokes, strokeOutlinePath, type BrushStyle } from '../core';
import { EraserIcon, LibraryIcon, OnionIcon, PenIcon, RedoIcon, SelectIcon, UndoIcon } from './icons';
import { Slider } from './Slider';
import { actions, setState, useEditor } from './store';
import { Divider, IconButton, Island, Popover, cx } from './ui';
import { usePopover } from './usePopover';

export const MIN_SIZE = 1;
export const MAX_SIZE = 48;

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const color = useEditor((s) => s.color);
  const onion = useEditor((s) => s.onion);
  const libraryOpen = useEditor((s) => s.libraryOpen);

  return (
    <Island className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 p-1 max-[1100px]:top-[60px]">
      <IconButton active={tool === 'select'} aria-pressed={tool === 'select'} title="Select (V): click, Shift-click or drag a box; drag to move" onClick={() => setState({ tool: 'select' })}>
        <SelectIcon />
      </IconButton>
      <IconButton active={tool === 'pen'} aria-pressed={tool === 'pen'} title="Pen (P)" onClick={() => setState({ tool: 'pen' })}>
        <PenIcon />
      </IconButton>
      <IconButton active={tool === 'eraser'} aria-pressed={tool === 'eraser'} title="Eraser (E): erases strokes in the current step" onClick={() => setState({ tool: 'eraser' })}>
        <EraserIcon />
      </IconButton>
      <Divider />
      {PALETTE.map((c, i) => (
        <button
          key={c}
          className={cx(
            'mx-0.5 size-[22px] shrink-0 rounded-full border-2 border-white transition duration-100 ease-snappy hover:scale-110',
            color === c ? 'ring-2 ring-accent' : 'ring-1 ring-black/10',
          )}
          style={{ background: c }}
          aria-pressed={color === c}
          aria-label={`Color ${i + 1}`}
          title={`Color (${i + 1})`}
          onClick={() => setState({ color: c, tool: 'pen' })}
        />
      ))}
      <Divider />
      <BrushPicker />
      <Divider />
      <IconButton title="Undo (Ctrl/⌘ Z)" aria-label="Undo" onClick={actions.undo}>
        <UndoIcon />
      </IconButton>
      <IconButton title="Redo (Ctrl/⌘ Shift Z)" aria-label="Redo" onClick={actions.redo}>
        <RedoIcon />
      </IconButton>
      <IconButton active={onion} aria-pressed={onion} title="Onion skin (O): dim earlier steps, ghost the next one" onClick={() => setState({ onion: !onion })}>
        <OnionIcon />
      </IconButton>
      <Divider />
      <IconButton active={libraryOpen} aria-pressed={libraryOpen} title="Library of saved objects (I)" onClick={() => setState({ libraryOpen: !libraryOpen })}>
        <LibraryIcon />
      </IconButton>
    </Island>
  );
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
          'inline-flex h-[34px] min-w-14 items-center gap-2 rounded-lg px-2 transition-colors duration-100',
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
        <span className="min-w-5 text-left text-xs tabular-nums">{fmtSize(size)}</span>
      </button>
      {open && (
        <Popover className="left-1/2 w-[316px] -translate-x-1/2" role="dialog" aria-label="Brush">
          <div className="grid grid-cols-5 gap-1 border-b border-line pb-3" role="radiogroup" aria-label="Brush style">
            {BRUSH_STYLES.map((b) => (
              <button
                key={b}
                className={cx(
                  'flex flex-col items-center gap-1 rounded-lg border px-0.5 pt-1.5 pb-1 text-[10.5px] transition-colors',
                  brush === b ? 'border-accent bg-accent-soft text-accent' : 'border-transparent text-muted hover:bg-hover',
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
          <BrushSample brush={brush} size={size} color={color} className="mb-1 h-16 rounded-lg bg-paper" />
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
                  'h-[26px] flex-1 rounded-md border text-xs tabular-nums transition-colors',
                  size === v ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:border-faint',
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
