// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback } from 'react';
import { setState, useEditor } from './store';
import { CloseIcon } from './icons';
import { IconButton, Island, Kbd } from './ui';
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
    ['N', 'New step on this track'],
    ['Shift N', 'New scene'],
    ['← / →', 'Previous / next step'],
    ['Shift ⌫', 'Delete step'],
  ]],
  ['Timeline', [
    ['Double-click', 'Add a step on a track'],
    ['Drag a step', 'Move it in time or to a track'],
    ['Drag its edge', 'Change the hold'],
    ['Right-click', 'Scene actions'],
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
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-scrim p-4">
      <Island ref={ref} className="max-h-[calc(100vh-32px)] w-full max-w-3xl animate-pop-in overflow-auto px-7 pt-6 pb-7 shadow-pop" role="dialog" aria-label="Keyboard shortcuts">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <IconButton aria-label="Close" title="Close (Esc)" onClick={close}>
            <CloseIcon />
          </IconButton>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-8 gap-y-6">
          {GROUPS.map(([title, rows]) => (
            <section key={title}>
              <h3 className="mb-2 font-semibold text-ink">{title}</h3>
              {rows.map(([keys, what]) => (
                <div className="flex items-center justify-between gap-3 py-1.5" key={keys}>
                  <span className="text-muted">{what}</span>
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
