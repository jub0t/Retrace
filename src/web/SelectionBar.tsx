// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useEffect, useRef, useState } from 'react';
import { CloseIcon, CopyIcon, SaveObjectIcon, TrashIcon } from './icons';
import { actions, getState, setState, useEditor } from './store';
import { IconButton, Island, TextButton } from './ui';

/** Floats above the timeline while strokes are selected: save as an object, copy, delete. */
export function SelectionBar() {
  const count = useEditor((s) => (s.playhead === null ? s.selection.size : 0));
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

  const startNaming = () => {
    setName(`Object ${getState().library.length + 1}`);
    setNaming(true);
  };
  const save = () => {
    if (actions.saveSelectionAsAsset(name)) setNaming(false);
  };
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
    <Island className="absolute bottom-3 left-1/2 flex -translate-x-1/2 animate-pop-in items-center gap-0.5 p-1">
      {naming ? (
        <form
          className="flex items-center gap-1.5 pl-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            ref={inputRef}
            className="h-8 w-52 rounded-lg border border-line bg-[#fafbfc] px-2.5 outline-none select-text focus:border-accent focus:bg-white focus:ring-3 focus:ring-accent/15"
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
          <button type="submit" className="h-8 rounded-lg bg-accent px-3 font-medium text-white hover:bg-accent-strong">
            Save
          </button>
          <TextButton type="button" onClick={() => setNaming(false)}>
            Cancel
          </TextButton>
        </form>
      ) : (
        <>
          <span className="px-2.5 text-muted tabular-nums">
            {count} stroke{count === 1 ? '' : 's'}
          </span>
          <TextButton className="font-medium text-accent" onClick={startNaming} title="Save the selection to your library to reuse later">
            <SaveObjectIcon />
            Save as object
          </TextButton>
          <IconButton title="Copy (Ctrl/⌘ C): paste into any Retrace tab or project" aria-label="Copy" onClick={copy}>
            <CopyIcon />
          </IconButton>
          <IconButton tone="danger" title="Delete (⌫)" aria-label="Delete selection" onClick={actions.deleteSelection}>
            <TrashIcon />
          </IconButton>
          <IconButton title="Deselect (Esc)" aria-label="Deselect" onClick={actions.clearSelection}>
            <CloseIcon />
          </IconButton>
        </>
      )}
    </Island>
  );
}
