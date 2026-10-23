// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import type { ComponentProps, ReactNode } from 'react';

/** Join class names, skipping falsy values. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Island({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cx('rounded-panel bg-raised shadow-island', className)} {...rest} />;
}

/** Floating panel anchored to its (relatively positioned) parent: below it, or to its right. */
export type PopoverSide = 'bottom' | 'right' | 'right-end';

const POPOVER_SIDES: Record<PopoverSide, string> = {
  bottom: 'top-[calc(100%+8px)]',
  right: 'top-0 left-[calc(100%+10px)]',
  /** To the right, bottom-aligned with the anchor: for anchors low on the screen. */
  'right-end': 'bottom-0 left-[calc(100%+10px)]',
};

export function Popover({ className, side = 'bottom', ...rest }: ComponentProps<'div'> & { side?: PopoverSide }) {
  return (
    <div
      className={cx('absolute z-30 rounded-panel bg-raised p-3 shadow-pop animate-pop-in', POPOVER_SIDES[side], className)}
      {...rest}
    />
  );
}

/** A titled group in a side panel. */
export function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('border-b border-line px-3.5 pt-3 pb-3.5', className)}>
      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <h3 className="font-medium text-ink">{title}</h3>
        {aside}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** Label on the left, control on the right. */
export function Field({ label, children, hint, top }: { label: string; children: ReactNode; hint?: string; top?: boolean }) {
  return (
    <div className={cx('flex gap-3', top ? 'items-start' : 'items-center')} title={hint}>
      <span className={cx('w-16 shrink-0 text-muted', top && 'leading-5')}>{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-40', checked ? 'bg-accent' : 'bg-field-active')}
      onClick={() => onChange(!checked)}
    >
      <span className={cx('absolute top-[2px] size-[14px] rounded-full bg-white shadow-sm transition-[left] duration-150 ease-snappy', checked ? 'left-4' : 'left-[2px]')} />
    </button>
  );
}

/** Plain text input styled for panels. Commits on Enter or blur; Escape reverts. */
export function CommitInput({ value, onCommit, className, ...rest }: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
  return (
    <input
      key={value}
      defaultValue={value}
      className={cx(
        'h-7 min-w-0 rounded-ctl bg-field px-2 outline-none transition select-text placeholder:text-faint hover:bg-field-hover focus:bg-field focus:ring-1 focus:ring-accent',
        className,
      )}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      {...rest}
    />
  );
}

interface ButtonProps extends ComponentProps<'button'> {
  /** Highlighted state (selected tool, open menu, toggle on). */
  active?: boolean;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
}

const buttonBase =
  'inline-flex shrink-0 items-center justify-center rounded-ctl transition-colors duration-100 active:translate-y-px disabled:text-faint disabled:active:translate-y-0';

export function IconButton({ active, size = 'md', tone = 'default', className, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        buttonBase,
        size === 'md' ? 'size-7' : 'size-6',
        active ? 'bg-accent-soft text-accent' : 'enabled:hover:bg-hover',
        tone === 'danger' && 'enabled:hover:bg-danger-soft enabled:hover:text-danger',
        className,
      )}
      {...rest}
    />
  );
}

export function TextButton({ active, className, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(buttonBase, 'h-7 gap-1.5 px-2.5 whitespace-nowrap', active ? 'bg-accent-soft text-accent' : 'enabled:hover:bg-hover', className)}
      {...rest}
    />
  );
}

export function Divider() {
  return <span className="mx-1.5 h-5 w-px shrink-0 bg-line" />;
}

export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-block min-w-5 rounded-[4px] bg-field px-1.5 text-center font-mono text-[11px] leading-[18px] font-medium whitespace-nowrap text-ink">
      {children}
    </kbd>
  );
}
