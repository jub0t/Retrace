// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback } from 'react';
import { setState, useEditor } from './store';
import { Island, Kbd, TextButton } from './ui';
import { usePopover } from './usePopover';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

const GROUPS: [string, [string, string][]][] = [
  ['Draw', [
    ['P', 'Pen'],
    ['E', 'Eraser (current step)'],
    ['1 – 6', 'Pick color'],
    ['− / =', 'Brush size'],
    ['O', 'Onion skin'],
  ]],
  ['Steps', [
    ['N', 'New step after current'],
    ['← / →', 'Previous / next step'],
    ['[ / ]', 'Move step'],
    ['Shift ⌫', 'Delete step'],
  ]],
  ['Playback', [
    ['Space', 'Play / pause'],
    ['Shift Space', 'Play from this step'],
    [', / .', 'Previous / next frame'],
    ['Shift , / .', '10 frames'],
    ['L', 'Loop'],
    ['Esc', 'Back to editing'],
  ]],
  ['Edit', [
    [`${MOD} Z`, 'Undo'],
    [`${MOD} Shift Z`, 'Redo'],
    [`${MOD} A`, 'Select all in step'],
    [`${MOD} C / X / V`, 'Copy / cut / paste'],
    ['⌫', 'Delete selection'],
    ['Arrows', 'Nudge selection'],
  ]],
  ['File', [
    [`${MOD} S`, 'Save'],
    [`${MOD} Shift S`, 'Save as'],
    [`${MOD} O`, 'Open'],
    [`${MOD} E`, 'Export'],
  ]],
];

export function HelpPanel() {
  const open = useEditor((s) => s.helpOpen);
  const close = useCallback(() => setState({ helpOpen: false }), []);
  const ref = usePopover<HTMLDivElement>(open, close);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-ink/25 p-4">
      <Island ref={ref} className="max-h-[calc(100vh-32px)] w-full max-w-3xl animate-pop-in overflow-auto px-6 pt-5 pb-6 shadow-pop" role="dialog" aria-label="Keyboard shortcuts">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">Keyboard shortcuts</h2>
          <TextButton onClick={close}>Close</TextButton>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-7 gap-y-5">
          {GROUPS.map(([title, rows]) => (
            <section key={title}>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
              {rows.map(([keys, what]) => (
                <div className="flex items-center justify-between gap-3 border-b border-hover py-1" key={keys}>
                  <span>{what}</span>
                  <Kbd>{keys}</Kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Island>
    </div>
  );
}
