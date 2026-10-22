import type { ComponentProps } from 'react';

/** Join class names, skipping falsy values. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Island({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cx('rounded-xl bg-white shadow-island', className)} {...rest} />;
}

/** Floating panel anchored under its (relatively positioned) parent. */
export function Popover({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cx('absolute top-[calc(100%+8px)] z-20 rounded-xl bg-white p-3 shadow-pop animate-pop-in', className)} {...rest} />;
}

interface ButtonProps extends ComponentProps<'button'> {
  /** Highlighted state (selected tool, open menu, toggle on). */
  active?: boolean;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
}

const buttonBase =
  'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors duration-100 active:translate-y-px disabled:text-faint disabled:active:translate-y-0';

export function IconButton({ active, size = 'md', tone = 'default', className, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        buttonBase,
        size === 'md' ? 'size-[34px]' : 'size-7',
        active ? 'bg-accent-soft text-accent' : 'enabled:hover:bg-hover',
        tone === 'danger' && 'enabled:hover:bg-red-50 enabled:hover:text-red-600',
        className,
      )}
      {...rest}
    />
  );
}

export function TextButton({ active, className, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(buttonBase, 'h-[34px] gap-1.5 px-2.5 whitespace-nowrap', active ? 'bg-accent-soft text-accent' : 'enabled:hover:bg-hover', className)}
      {...rest}
    />
  );
}

export function Divider() {
  return <span className="mx-1.5 h-5 w-px shrink-0 bg-line" />;
}

export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-block min-w-5 rounded-[5px] border border-b-2 border-line bg-white px-1.5 text-center font-mono text-[11px] leading-4 font-semibold whitespace-nowrap text-ink">
      {children}
    </kbd>
  );
}
