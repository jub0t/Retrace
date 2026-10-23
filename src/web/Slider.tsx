// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useRef, useState, type CSSProperties } from 'react';
import { cx } from './ui';

export interface SliderMark {
  value: number;
  label?: string;
}

export interface SliderProps {
  /** Accessible name. */
  label: string;
  value: number;
  min: number;
  max: number;
  /** Fires continuously while dragging; keep it cheap and history-free. */
  onChange: (value: number) => void;
  /** Fires once when a gesture ends (pointer up, key press, reset). */
  onCommit?: (value: number) => void;
  /**
   * How values spread along the track. `log` suits multipliers (0.25×..4×), `pow` gives
   * small values more room (0..5 s), `linear` is for time.
   */
  scale?: 'linear' | 'log' | 'pow';
  /** Quantize values to this increment. */
  step?: number;
  format?: (value: number) => string;
  marks?: SliderMark[];
  /** Values the thumb gently sticks to (hold Alt to ignore). */
  detents?: number[];
  /** Double-click resets to this value. */
  defaultValue?: number;
  variant?: 'default' | 'scrubber';
  className?: string;
  /** Custom track background (e.g. a hue rainbow); hides the filled portion. */
  trackStyle?: CSSProperties;
}

const DETENT_RANGE = 0.025; // fraction of the track
const FINE_FACTOR = 0.2; // Shift-drag moves at 1/5 speed

/**
 * A pointer/keyboard slider built for direct manipulation: click anywhere to jump, drag
 * with live feedback, Shift for fine control, detents on meaningful values, double-click
 * to reset, and a value bubble that follows the thumb.
 */
export function Slider(props: SliderProps) {
  const { label, value, min, max, onChange, onCommit, scale = 'linear', step, format = String, marks = [], detents = [], defaultValue, variant = 'default' } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ lastX: number; pos: number } | null>(null);
  const latest = useRef(value);
  const [dragging, setDragging] = useState(false);

  const toPos = (v: number) => {
    const c = clamp(v, min, max);
    if (scale === 'log') return Math.log(c / min) / Math.log(max / min);
    if (scale === 'pow') return Math.sqrt((c - min) / (max - min));
    return (c - min) / (max - min);
  };
  const fromPos = (p: number) => {
    const c = clamp(p, 0, 1);
    if (scale === 'log') return min * Math.pow(max / min, c);
    if (scale === 'pow') return min + c * c * (max - min);
    return min + c * (max - min);
  };
  const quantize = (v: number) => clamp(step ? Math.round(v / step) * step : v, min, max);

  const emit = (v: number) => {
    const q = quantize(v);
    latest.current = q;
    onChange(q);
  };
  const commit = (v = latest.current) => onCommit?.(v);

  const posFromPointer = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };
  const withDetents = (pos: number, free: boolean) => {
    if (free) return pos;
    for (const d of detents) if (Math.abs(pos - toPos(d)) < DETENT_RANGE) return toPos(d);
    return pos;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
    const pos = posFromPointer(e.clientX);
    drag.current = { lastX: e.clientX, pos };
    setDragging(true);
    emit(fromPos(withDetents(pos, e.altKey)));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const width = trackRef.current!.getBoundingClientRect().width;
    // Shift: move relative to the last position at reduced speed; otherwise follow the pointer.
    d.pos = e.shiftKey ? clamp(d.pos + ((e.clientX - d.lastX) / width) * FINE_FACTOR, 0, 1) : posFromPointer(e.clientX);
    d.lastX = e.clientX;
    emit(fromPos(withDetents(d.pos, e.altKey || e.shiftKey)));
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    commit();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = step ? value + step * big : fromPos(toPos(value) + 0.01 * big);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = step ? value - step * big : fromPos(toPos(value) - 0.01 * big);
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else if ((e.key === 'Backspace' || e.key === 'Delete') && defaultValue !== undefined) next = defaultValue;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    emit(next);
    commit();
  };

  const onDoubleClick = () => {
    if (defaultValue === undefined) return;
    emit(defaultValue);
    commit();
  };

  const pos = toPos(value);
  const scrubber = variant === 'scrubber';
  return (
    <div
      className={cx(
        'group relative flex min-w-20 flex-1 cursor-pointer touch-none items-center outline-none',
        scrubber ? 'h-[34px]' : 'h-7',
        props.className,
      )}
      data-dragging={dragging || undefined}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      title={defaultValue !== undefined ? `${label}: double-click to reset, Shift-drag for fine control` : label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    >
      <div
        ref={trackRef}
        className={cx('relative w-full rounded-full', props.trackStyle ? 'h-3 ring-1 ring-line-strong ring-inset' : scrubber ? 'h-1.5 bg-field-active' : 'h-1 bg-field-active')}
        style={props.trackStyle}
      >
        {!props.trackStyle && (
          <div
            className={cx('absolute inset-y-0 left-0 rounded-full', scrubber ? 'bg-accent/40' : 'bg-accent')}
            style={{ width: `${pos * 100}%` }}
          />
        )}
        {marks.map((m) => (
          <span
            key={m.value}
            className={cx(
              'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2',
              scrubber ? 'h-3.5 w-0.5 rounded-sm bg-faint' : 'size-1 rounded-full bg-white ring-1 ring-black/30',
            )}
            style={{ left: `${toPos(m.value) * 100}%` }}
          />
        ))}
        {scrubber ? (
          <div className="absolute top-1/2 h-[26px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-accent" style={{ left: `${pos * 100}%` }}>
            <div className="absolute -top-1.5 left-1/2 size-[11px] -translate-x-1/2 rounded-t-[3px] rounded-b-full bg-accent" />
          </div>
        ) : (
          <div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-thumb transition-[scale,box-shadow] duration-100 ease-snappy group-focus-visible:shadow-thumb-active group-data-dragging:scale-110 group-data-dragging:shadow-thumb-active"
            style={{ left: `${pos * 100}%` }}
          />
        )}
        <span
          className={cx(
            'pointer-events-none absolute -translate-x-1/2 translate-y-1 rounded-ctl bg-raised px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-ink tabular-nums opacity-0 shadow-pop transition duration-100',
            'group-focus-visible:translate-y-0 group-focus-visible:opacity-100 group-data-dragging:translate-y-0 group-data-dragging:opacity-100',
            scrubber ? 'bottom-[calc(100%+16px)] group-hover:translate-y-0 group-hover:opacity-100' : 'bottom-[calc(100%+12px)]',
          )}
          style={{ left: `${pos * 100}%` }}
        >
          {format(value)}
        </span>
      </div>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
