// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useEffect } from 'react';
import { PALETTE, getTimeline } from '../core';
import { Canvas, zoomBy, zoomToActual, zoomToFit } from './Canvas';
import { openFile, openFromUrlParam, saveFile, saveFileAs, watchLinkedFile } from './files';
import { HelpPanel } from './HelpPanel';
import { Inspector } from './Inspector';
import { ProjectsHome } from './ProjectsHome';
import { Timeline } from './Timeline';
import { ToolRail } from './ToolRail';
import { TopBar } from './TopBar';
import { actions, flushSave, getState, initStorage, setState, useEditor } from './store';

export function App() {
  const screen = useEditor((s) => s.screen);
  usePlayback();
  useShortcuts();
  useClipboard();
  useEffect(watchLinkedFile, []);
  useEffect(() => void initStorage().then(openFromUrlParam), []);
  useEffect(() => {
    // Don't lose the last half-second of edits when the tab closes or goes to the background.
    const flush = () => void flushSave();
    const onVisibility = () => document.hidden && flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  return (
    <>
      {screen === 'loading' ? (
        <div className="grid h-full place-items-center text-muted">Loading your projects…</div>
      ) : screen === 'home' ? (
        <ProjectsHome />
      ) : (
        <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]">
          <TopBar />
          <div className="flex min-h-0">
            <ToolRail />
            <main className="relative min-w-0 flex-1">
              <Canvas />
            </main>
            <Inspector />
          </div>
          <Timeline />
        </div>
      )}
      <HelpPanel />
      <Toast />
    </>
  );
}

/** Status messages, briefly, at the bottom of the screen. */
function Toast() {
  const status = useEditor((s) => s.status);
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setState({ status: null }), 5000);
    return () => clearTimeout(t);
  }, [status]);
  if (!status) return null;
  return (
    <button
      className="fixed bottom-6 left-1/2 z-40 max-w-[min(560px,calc(100%-32px))] -translate-x-1/2 animate-pop-in truncate rounded-lg bg-ink px-4 py-2.5 text-white shadow-pop"
      onClick={() => setState({ status: null })}
      title="Dismiss"
    >
      {status}
    </button>
  );
}

/**
 * Copy/cut/paste through real clipboard events, so strokes travel as JSON text between
 * tabs, sessions and projects (and can be shared in a chat). Text fields keep native behavior.
 */
function useClipboard() {
  useEffect(() => {
    const inField = (e: Event) => (e.target as HTMLElement | null)?.closest?.('input, select, textarea, [contenteditable]');
    const onCopy = (e: ClipboardEvent) => {
      if (inField(e) || getState().screen !== 'editor') return;
      const text = actions.selectionClipboard();
      if (!text || !e.clipboardData) return;
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
      const n = getState().selection.size;
      if (e.type === 'cut') actions.deleteSelection();
      setState({ status: `${e.type === 'cut' ? 'Cut' : 'Copied'} ${n} stroke${n === 1 ? '' : 's'}` });
    };
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e) || getState().screen !== 'editor') return;
      const text = e.clipboardData?.getData('text/plain');
      if (text && actions.pasteText(text)) e.preventDefault();
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCopy);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCopy);
      window.removeEventListener('paste', onPaste);
    };
  }, []);
}

function usePlayback() {
  const playing = useEditor((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    const timeline = getTimeline(getState().project);
    let t0 = performance.now() - (getState().playhead ?? 0);
    let raf = 0;
    const tick = (now: number) => {
      let t = now - t0;
      if (t >= timeline.duration) {
        if (!getState().loop) {
          setState({ playing: false, playhead: timeline.duration });
          return;
        }
        t0 = now;
        t = 0;
      }
      setState({ playhead: t });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}

/**
 * App-wide shortcuts. Editor commands take over the browser's defaults (save page,
 * open file, select all, find-in-page for E…). Ctrl/⌘ N, T and W are reserved by the
 * browser and can't be intercepted. Inside text fields, text-editing keys stay native.
 */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const inField = (e.target as HTMLElement).closest('input, select, textarea, [contenteditable]');

      if (mod && key === 'o') {
        e.preventDefault();
        void openFile();
        return;
      }
      if (s.screen !== 'editor') return;

      if (mod) {
        if (key === 's') e.shiftKey ? saveFileAs() : saveFile();
        else if (key === 'e') setState({ exportMenuOpen: !s.exportMenuOpen });
        else if (key === '=' || key === '+') zoomBy(1.25);
        else if (key === '-' || key === '_') zoomBy(1 / 1.25);
        else if (inField) return;
        else if (key === 'z') actions[e.shiftKey ? 'redo' : 'undo']();
        else if (key === 'y') actions.redo();
        else if (key === 'a') {
          actions.selectAll();
          setState({ tool: 'select' });
        } else return; // Copy, cut and paste arrive as clipboard events (see useClipboard).
        e.preventDefault();
        return;
      }
      if (inField || e.altKey) return;

      const nudge = e.shiftKey ? 10 : 1;
      if (s.selection.size && key.startsWith('arrow')) {
        const [dx, dy] = { arrowleft: [-nudge, 0], arrowright: [nudge, 0], arrowup: [0, -nudge], arrowdown: [0, nudge] }[key]!;
        actions.nudgeSelection(dx, dy);
      } else if (key === ' ') e.shiftKey ? actions.playFromCurrentStep() : actions.togglePlay();
      else if (key === 'escape') {
        if (s.helpOpen) setState({ helpOpen: false });
        else if (s.selection.size) actions.clearSelection();
        else actions.exitPreview();
      } else if (key === 'backspace' || key === 'delete') {
        if (e.shiftKey) actions.deleteStep();
        else if (s.selection.size) actions.deleteSelection();
        else return;
      } else if (key === '?' || (key === '/' && e.shiftKey)) setState({ helpOpen: !s.helpOpen });
      else if (e.shiftKey && e.code === 'Digit1') zoomToFit();
      else if (e.shiftKey && e.code === 'Digit0') zoomToActual();
      else if (key === 'p' || key === 'b') setState({ tool: 'pen' });
      else if (key === 'e') setState({ tool: 'eraser' });
      else if (key === 'v') setState({ tool: 'select' });
      else if (key === 'h') setState({ tool: 'hand' });
      else if (key === 'i') setState({ panel: s.panel === 'library' ? 'properties' : 'library' });
      else if (key === 'o') setState({ onion: !s.onion });
      else if (key === 'l') setState({ loop: !s.loop });
      else if (key === 'n') e.shiftKey ? actions.addScene() : actions.addStep();
      else if (key === 'arrowleft') actions.selectStep(s.current - 1);
      else if (key === 'arrowright') actions.selectStep(s.current + 1);
      else if (key === ',' || key === '<') actions.stepFrame(e.shiftKey ? -10 : -1);
      else if (key === '.' || key === '>') actions.stepFrame(e.shiftKey ? 10 : 1);
      else if (key === '[') actions.moveStep(-1);
      else if (key === ']') actions.moveStep(1);
      else if (key === '-' || key === '_') actions.setSize(s.size - (s.size > 10 ? 2 : 1));
      else if (key === '=' || key === '+') actions.setSize(s.size + (s.size >= 10 ? 2 : 1));
      else if (/^[1-9]$/.test(key) && PALETTE[Number(key) - 1]) actions.setColor(PALETTE[Number(key) - 1]);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
