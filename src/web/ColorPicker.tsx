// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback, useEffect, useRef, useState } from 'react';
import { PALETTE, gradientCss, type Gradient } from '../core';
import { colorAt, hexToHsv, hsvToHex, normalizeHex, type Hsv } from './color';
import { TrashIcon } from './icons';
import { Slider } from './Slider';
import { actions, getState, useEditor } from './store';
import { IconButton, Popover, cx, type PopoverSide } from './ui';
import { usePopover } from './usePopover';

const HUE_TRACK = 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)';

const PRESETS: { name: string; gradient: Gradient }[] = [
  { name: 'Sunset', gradient: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#ff6b6b' }, { offset: 0.5, color: '#f59f00' }, { offset: 1, color: '#ffd43b' }] } },
  { name: 'Ocean', gradient: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#1c7ed6' }, { offset: 1, color: '#22b8cf' }] } },
  { name: 'Mint', gradient: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#2f9e44' }, { offset: 1, color: '#a9e34b' }] } },
  { name: 'Grape', gradient: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#7950f2' }, { offset: 1, color: '#e64980' }] } },
  { name: 'Fire', gradient: { type: 'linear', angle: 270, stops: [{ offset: 0, color: '#e03131' }, { offset: 0.55, color: '#f76707' }, { offset: 1, color: '#ffe066' }] } },
  { name: 'Rainbow', gradient: { type: 'linear', angle: 0, stops: ['#e03131', '#f59f00', '#fcc419', '#40c057', '#1c7ed6', '#7950f2'].map((color, i, a) => ({ offset: i / (a.length - 1), color })) } },
  { name: 'Glow', gradient: { type: 'radial', angle: 0, stops: [{ offset: 0, color: '#c0eb75' }, { offset: 1, color: '#2b8a3e' }] } },
];

/** A first gradient that starts from the color you were already using. */
function startingGradient(color: string): Gradient {
  return { type: 'linear', angle: 0, stops: [{ offset: 0, color }, { offset: 1, color: color.toLowerCase() === '#7950f2' ? '#22b8cf' : '#7950f2' }] };
}

/** The toolbar's custom-paint swatch: shows the current color or gradient, opens the picker. */
export function PaintButton({ side = 'bottom' }: { side?: PopoverSide }) {
  const color = useEditor((s) => s.color);
  const gradient = useEditor((s) => s.gradient);
  const custom = gradient !== null || !(PALETTE as readonly string[]).includes(color);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = usePopover<HTMLDivElement>(open, close);

  return (
    <div className="relative" ref={ref}>
      <button
        className={cx(
          'grid size-7 shrink-0 place-items-center rounded-full p-[2px]',
          open || custom ? 'ring-2 ring-accent' : '',
        )}
        style={{ background: 'conic-gradient(#e03131, #f59f00, #fcc419, #40c057, #22b8cf, #1c7ed6, #7950f2, #e64980, #e03131)' }}
        aria-label="Custom color or gradient"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Any color or gradient"
        onClick={() => setOpen(!open)}
      >
        <span className="size-full rounded-full border-2 border-panel" style={{ background: gradient ? gradientCss(gradient) : color }} />
      </button>
      {open && <PaintPopover side={side} />}
    </div>
  );
}

function PaintPopover({ side }: { side: PopoverSide }) {
  const color = useEditor((s) => s.color);
  const gradient = useEditor((s) => s.gradient);
  const selected = useEditor((s) => s.selection.size);
  const [tab, setTab] = useState<'solid' | 'gradient'>(gradient ? 'gradient' : 'solid');
  // Remembered so flipping between tabs doesn't lose a gradient you were building.
  const lastGradient = useRef<Gradient | null>(gradient);
  if (gradient) lastGradient.current = gradient;

  const switchTab = (next: 'solid' | 'gradient') => {
    setTab(next);
    if (next === 'gradient') actions.setGradient(lastGradient.current ?? startingGradient(getState().color));
    else actions.setColor(getState().color);
  };

  return (
    <Popover side={side} className={cx('w-[288px]', side === 'bottom' && 'left-1/2 -translate-x-1/2')} role="dialog" aria-label="Color">
      <div className="mb-3 grid grid-cols-2 rounded-ctl bg-field p-0.5 font-medium" role="tablist">
        {(['solid', 'gradient'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={cx('h-7 rounded-ctl capitalize transition', tab === t ? 'bg-field-active text-ink' : 'text-muted hover:text-ink')}
            onClick={() => switchTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'solid' ? <SolidTab color={color} /> : <GradientTab gradient={gradient ?? lastGradient.current ?? startingGradient(color)} />}
      {selected > 0 && (
        <p className="mt-3 rounded-ctl bg-accent-soft px-2.5 py-1.5 text-xs text-accent">
          Recoloring {selected} selected
        </p>
      )}
    </Popover>
  );
}

function SolidTab({ color }: { color: string }) {
  const recent = useEditor((s) => s.recentColors);
  return (
    <div className="flex flex-col gap-3">
      <ColorEditor value={color} onChange={actions.setColor} />
      <Swatches label="Palette" colors={[...PALETTE]} active={color} onPick={(c) => actions.setColor(c)} />
      {recent.length > 0 && <Swatches label="Recent" colors={recent} active={color} onPick={(c) => actions.setColor(c)} />}
    </div>
  );
}

function GradientTab({ gradient }: { gradient: Gradient }) {
  const [active, setActive] = useState(0);
  const stop = gradient.stops[Math.min(active, gradient.stops.length - 1)];
  const update = (g: Gradient, final = true) => actions.setGradient(g, final);
  const setStop = (i: number, patch: Partial<Gradient['stops'][number]>, final: boolean) =>
    update({ ...gradient, stops: gradient.stops.map((s, k) => (k === i ? { ...s, ...patch } : s)) }, final);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-2 rounded-ctl bg-field p-0.5">
          {(['linear', 'radial'] as const).map((t) => (
            <button
              key={t}
              className={cx('h-6 rounded-ctl capitalize transition', gradient.type === t ? 'bg-field-active font-medium' : 'text-muted hover:text-ink')}
              aria-pressed={gradient.type === t}
              onClick={() => update({ ...gradient, type: t })}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="size-9 shrink-0 rounded-ctl ring-1 ring-line-strong" style={{ background: gradientCss(gradient) }} aria-hidden />
      </div>

      {gradient.type === 'linear' && (
        <div className="flex items-center gap-2.5">
          <span className="w-10 shrink-0 text-muted">Angle</span>
          <Slider
            label="Gradient angle"
            value={gradient.angle}
            min={0}
            max={360}
            step={1}
            format={(v) => `${Math.round(v)}°`}
            marks={[90, 180, 270].map((value) => ({ value }))}
            detents={[0, 45, 90, 135, 180, 225, 270, 315, 360]}
            defaultValue={0}
            onChange={(angle) => update({ ...gradient, angle }, false)}
            onCommit={(angle) => update({ ...gradient, angle }, true)}
          />
          <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(gradient.angle)}°</span>
        </div>
      )}

      <StopsBar gradient={gradient} active={active} onSelect={setActive} onChange={update} />

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          Stop {active + 1} of {gradient.stops.length} · {Math.round(stop.offset * 100)}%
        </span>
        <IconButton
          size="sm"
          tone="danger"
          title="Remove this stop"
          aria-label="Remove stop"
          disabled={gradient.stops.length <= 2}
          onClick={() => {
            update({ ...gradient, stops: gradient.stops.filter((_, k) => k !== active) });
            setActive(Math.max(0, active - 1));
          }}
        >
          <TrashIcon />
        </IconButton>
      </div>
      <ColorEditor value={stop.color} onChange={(c, final) => setStop(active, { color: c }, final)} />

      <div>
        <p className="mb-1.5 font-medium text-ink">Presets</p>
        <div className="grid grid-cols-7 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="aspect-square rounded-full ring-1 ring-line-strong"
              style={{ background: gradientCss(p.gradient) }}
              title={p.name}
              aria-label={`${p.name} gradient`}
              onClick={() => {
                update(p.gradient);
                setActive(0);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The gradient laid out left to right; drag stops to move them, click the bar to add one. */
function StopsBar({ gradient, active, onSelect, onChange }: { gradient: Gradient; active: number; onSelect: (i: number) => void; onChange: (g: Gradient, final: boolean) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; moved: boolean } | null>(null);
  const offsetAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100) / 100;
  };
  const move = (i: number, offset: number, final: boolean) =>
    onChange({ ...gradient, stops: gradient.stops.map((s, k) => (k === i ? { ...s, offset } : s)) }, final);

  return (
    <div
      ref={barRef}
      className="relative h-8 cursor-copy touch-none rounded-ctl ring-1 ring-line-strong ring-inset"
      style={{ background: `${gradientCss(gradient, true)}, repeating-conic-gradient(#e9ecef 0 25%, #fff 0 50%) 50% / 12px 12px` }}
      title="Click to add a stop"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const offset = offsetAt(e.clientX);
        const stops = [...gradient.stops, { offset, color: colorAt(gradient.stops, offset) }];
        onChange({ ...gradient, stops }, true);
        onSelect(stops.length - 1);
      }}
    >
      {gradient.stops.map((s, i) => (
        <button
          key={i}
          className={cx(
            'absolute top-1/2 h-9 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-ctl border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.25),0_1px_3px_rgb(0_0_0/0.3)]',
            i === active && 'outline-2 outline-offset-1 outline-accent',
          )}
          style={{ left: `${s.offset * 100}%`, background: s.color }}
          aria-label={`Stop ${i + 1} at ${Math.round(s.offset * 100)}%`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { index: i, moved: false };
            onSelect(i);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            drag.current.moved = true;
            move(drag.current.index, offsetAt(e.clientX), false);
          }}
          onPointerUp={(e) => {
            if (drag.current?.moved) move(drag.current.index, offsetAt(e.clientX), true);
            drag.current = null;
          }}
        />
      ))}
    </div>
  );
}

/** Saturation/brightness square, hue slider, hex field and eyedropper for one color. */
export function ColorEditor({ value, onChange }: { value: string; onChange: (hex: string, final: boolean) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  useEffect(() => {
    // Follow outside changes (palette clicks, another stop) but keep our hue for grays.
    setHsv((cur) => (hsvToHex(cur).toLowerCase() === value.toLowerCase() ? cur : hexToHsv(value, cur.h)));
  }, [value]);
  const update = (next: Hsv, final: boolean) => {
    setHsv(next);
    onChange(hsvToHex(next), final);
  };
  const EyeDropper = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;

  return (
    <div className="flex flex-col gap-2.5">
      <SvSquare hsv={hsv} onChange={update} />
      <Slider
        label="Hue"
        value={hsv.h}
        min={0}
        max={360}
        step={1}
        format={(v) => `${Math.round(v)}°`}
        trackStyle={{ background: HUE_TRACK }}
        onChange={(h) => update({ ...hsv, h }, false)}
        onCommit={(h) => update({ ...hsv, h }, true)}
      />
      <div className="flex items-center gap-2">
        <span className="size-7 shrink-0 rounded-ctl ring-1 ring-line-strong ring-inset" style={{ background: value }} aria-hidden />
        <HexField value={value} onCommit={(hex) => update(hexToHsv(hex, hsv.h), true)} />
        {EyeDropper && (
          <IconButton
            size="sm"
            title="Pick a color from the screen"
            aria-label="Eyedropper"
            onClick={() =>
              new EyeDropper()
                .open()
                .then((r) => update(hexToHsv(r.sRGBHex, hsv.h), true))
                .catch(() => {})
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14.5 4.5l5 5M17 2.5a2.1 2.1 0 013 3l-2.5 2.5-3-3L17 2.5zM14.5 5.5l-10 10V19.5h4l10-10" />
            </svg>
          </IconButton>
        )}
      </div>
    </div>
  );
}

function SvSquare({ hsv, onChange }: { hsv: Hsv; onChange: (hsv: Hsv, final: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pick = (e: React.PointerEvent, final: boolean) => {
    const r = ref.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange({ ...hsv, s, v }, final);
  };
  const nudge = (ds: number, dv: number) => onChange({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + ds)), v: Math.min(1, Math.max(0, hsv.v + dv)) }, true);

  return (
    <div
      ref={ref}
      className="relative h-36 cursor-crosshair touch-none rounded-ctl ring-1 ring-line-strong ring-inset outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
      role="slider"
      tabIndex={0}
      aria-label="Saturation and brightness"
      aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        pick(e, false);
      }}
      onPointerMove={(e) => dragging.current && pick(e, false)}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        pick(e, true);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (!moves[e.key]) return;
        e.preventDefault();
        e.stopPropagation();
        nudge(...moves[e.key]);
      }}
    >
      <span
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.3),0_1px_4px_rgb(0_0_0/0.4)]"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }}
      />
    </div>
  );
}

function HexField({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = useState(value.replace('#', ''));
  useEffect(() => setDraft(value.replace('#', '')), [value]);
  const commit = () => {
    const hex = normalizeHex(draft);
    if (hex) onCommit(hex);
    else setDraft(value.replace('#', ''));
  };
  return (
    <label className="flex h-7 min-w-0 flex-1 items-center rounded-ctl bg-field px-2 font-mono text-xs focus-within:ring-1 focus-within:ring-accent">
      <span className="text-faint">#</span>
      <input
        className="w-full min-w-0 bg-transparent px-1 uppercase outline-none select-text"
        value={draft}
        maxLength={7}
        spellCheck={false}
        aria-label="Hex color"
        onChange={(e) => setDraft(e.target.value.replace('#', ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function Swatches({ label, colors, active, onPick }: { label: string; colors: string[]; active: string; onPick: (c: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 font-medium text-ink">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            className={cx('size-6 rounded-full border-2 border-raised', c.toLowerCase() === active.toLowerCase() ? 'ring-2 ring-accent' : 'ring-1 ring-line-strong')}
            style={{ background: c }}
            aria-label={c}
            title={c}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}
