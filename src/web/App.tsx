import { useEffect } from 'react';
import { PALETTE, getTimeline } from '../core';
import { Canvas } from './Canvas';
import { openFile, saveFile, saveFileAs, watchLinkedFile } from './files';
import { HelpPanel } from './HelpPanel';
import { MenuBar } from './MenuBar';
import { Timeline } from './Timeline';
import { Toolbar } from './Toolbar';
import { actions, getState, setState, useEditor } from './store';

export function App() {
  usePlayback();
  useShortcuts();
  useEffect(watchLinkedFile, []);

  return (
    <div className="grid h-full grid-rows-[1fr_auto]">
      <main className="relative min-h-0">
        <Canvas />
        <MenuBar />
        <Toolbar />
      </main>
      <Timeline />
      <HelpPanel />
    </div>
  );
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

      if (mod) {
        if (key === 's') e.shiftKey ? saveFileAs() : saveFile();
        else if (key === 'o') openFile();
        else if (key === 'e') setState({ exportMenuOpen: !s.exportMenuOpen });
        else if (inField) return;
        else if (key === 'z') actions[e.shiftKey ? 'redo' : 'undo']();
        else if (key === 'y') actions.redo();
        else if (key === 'a') actions.selectAll();
        else if (key === 'c') actions.copy();
        else if (key === 'x') actions.cut();
        else if (key === 'v') actions.paste();
        else return;
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
      else if (key === 'p' || key === 'b') setState({ tool: 'pen' });
      else if (key === 'e') setState({ tool: 'eraser' });
      else if (key === 'o') setState({ onion: !s.onion });
      else if (key === 'l') setState({ loop: !s.loop });
      else if (key === 'n') actions.addStep();
      else if (key === 'arrowleft') actions.selectStep(s.current - 1);
      else if (key === 'arrowright') actions.selectStep(s.current + 1);
      else if (key === ',' || key === '<') actions.stepFrame(e.shiftKey ? -10 : -1);
      else if (key === '.' || key === '>') actions.stepFrame(e.shiftKey ? 10 : 1);
      else if (key === '[') actions.moveStep(-1);
      else if (key === ']') actions.moveStep(1);
      else if (key === '-' || key === '_') actions.setSize(s.size - (s.size > 10 ? 2 : 1));
      else if (key === '=' || key === '+') actions.setSize(s.size + (s.size >= 10 ? 2 : 1));
      else if (/^[1-9]$/.test(key) && PALETTE[Number(key) - 1]) setState({ color: PALETTE[Number(key) - 1], tool: 'pen' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
