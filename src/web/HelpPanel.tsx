// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback } from 'react';
import { setState, useEditor } from './store';
import { Island, Kbd, TextButton } from './ui';
import { usePopover } from './usePopover';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

const GROUPS: [string, [string, string][]][] = [
  ['Draw', [
    ['V', 'Select (any visible stroke)'],
    ['P', 'Pen'],
    ['E', 'Eraser (any visible stroke)'],
    ['H', 'Hand: drag to pan'],
    ['1 – 6', 'Pick color'],
    ['− / =', 'Brush size'],
    ['O', 'Onion skin'],
  ]],
  ['Steps & scenes', [
    ['N', 'New step after current'],
    ['Shift N', 'New scene (clean canvas)'],
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
  ['View', [
    ['Scroll', 'Pan the canvas'],
    [`Pinch · ${MOD} scroll`, 'Zoom the canvas'],
    [`${MOD} = / −`, 'Zoom in / out'],
    ['Shift 1', 'Fit to screen'],
    ['Shift 0', 'Zoom to 100%'],
    [`${MOD} scroll`, 'Zoom the timeline'],
  ]],
  ['Edit', [
    [`${MOD} Z`, 'Undo'],
    [`${MOD} Shift Z`, 'Redo'],
    [`${MOD} A`, 'Select everything visible'],
    [`${MOD} C / X / V`, 'Copy / cut / paste (works across tabs)'],
    ['⌫', 'Delete selection'],
    ['Arrows', 'Nudge selection'],
  ]],
  ['Objects', [
    ['I', 'Library'],
    ['Shift click', 'Add to selection'],
    ['Drag corner', 'Scale selection'],
  ]],
  ['File', [
    [`${MOD} S`, 'Save to file'],
    [`${MOD} Shift S`, 'Save as'],
    [`${MOD} O`, 'Open file as new project'],
    [`${MOD} E`, 'Export'],
  ]],
];

export function HelpPanel() {
  const open = useEditor((s) => s.helpOpen);
  const close = useCallback(() => setState({ helpOpen: false }), []);
  const ref = usePopover<HTMLDivElement>(open, close);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/60 p-4">
      <Island ref={ref} className="max-h-[calc(100vh-32px)] w-full max-w-3xl animate-pop-in overflow-auto px-6 pt-5 pb-6 shadow-pop" role="dialog" aria-label="Keyboard shortcuts">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">Keyboard shortcuts</h2>
          <TextButton onClick={close}>Close</TextButton>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-7 gap-y-5">
          {GROUPS.map(([title, rows]) => (
            <section key={title}>
              <h3 className="mb-1.5 font-medium text-ink">{title}</h3>
              {rows.map(([keys, what]) => (
                <div className="flex items-center justify-between gap-3 border-b border-line py-1" key={keys}>
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
