// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback, useState } from 'react';
import { exportVideo } from './exportVideo';
import { download, exportAnimatedSvg, openFile, projectFileName, reloadFromDisk, saveFile, saveFileAs } from './files';
import { ChevronDownIcon, ExportIcon, GridIcon, HelpIcon, RedoIcon, UndoIcon } from './icons';
import { actions, getState, setState, useEditor } from './store';
import { CommitInput, IconButton, Popover, TextButton, cx } from './ui';
import { usePopover } from './usePopover';

export const LOGO_URL = new URL('../../assets/logo-light.svg', import.meta.url).href;
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';

/** Project identity and file actions across the top of the editor. */
export function TopBar() {
  const projectId = useEditor((s) => s.projectId);
  const projectName = useEditor((s) => s.projectName);

  return (
    <header className="flex h-12 items-center gap-1 border-b border-line bg-white px-2">
      <TextButton title="All projects" onClick={() => void actions.goHome()}>
        <img src={LOGO_URL} alt="" className="size-5" />
        <GridIcon />
        <span className="max-[700px]:hidden">Projects</span>
      </TextButton>
      <span className="text-faint">/</span>
      <CommitInput
        value={projectName}
        aria-label="Project name"
        title="Rename project"
        className="w-[min(280px,30vw)] border-transparent bg-transparent font-medium hover:border-line"
        onCommit={(name) => void actions.renameProject(projectId, name)}
      />
      <SaveStatus />
      <LinkedFile />

      <div className="ml-auto flex items-center gap-0.5">
        <IconButton title={`Undo (${MOD}Z)`} aria-label="Undo" onClick={actions.undo}>
          <UndoIcon />
        </IconButton>
        <IconButton title={`Redo (${MOD}Shift Z)`} aria-label="Redo" onClick={actions.redo}>
          <RedoIcon />
        </IconButton>
        <span className="mx-1.5 h-5 w-px bg-line" />
        <FileMenu />
        <IconButton title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setState({ helpOpen: true })}>
          <HelpIcon />
        </IconButton>
        <ExportMenu />
      </div>
    </header>
  );
}

function SaveStatus() {
  const saveState = useEditor((s) => s.saveState);
  const stored = useEditor((s) => s.projectId !== null);
  const label = !stored ? 'Not saved in browser' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? "Couldn't save" : 'Saved';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-1.5 text-xs whitespace-nowrap text-muted"
      title={stored ? 'Every change is saved in this browser automatically' : 'Browser storage is unavailable: save to a file to keep your work'}
    >
      <span className={cx('size-[7px] rounded-full', !stored || saveState === 'error' ? 'bg-red-500' : saveState === 'saving' ? 'bg-amber-400' : 'bg-emerald-500')} />
      {label}
    </span>
  );
}

function LinkedFile() {
  const fileName = useEditor((s) => s.fileName);
  const dirty = useEditor((s) => s.dirty);
  const diskChanged = useEditor((s) => s.diskChanged);
  if (!fileName) return null;
  return (
    <>
      <span
        className="ml-1 inline-flex max-w-56 items-center gap-1.5 rounded-md bg-hover px-2 py-1 text-xs text-muted max-[900px]:hidden"
        title="Linked file: Save writes here, and outside changes (e.g. from an AI agent) load live"
      >
        <span className={cx('size-[6px] shrink-0 rounded-full', dirty ? 'bg-amber-500' : 'bg-emerald-600')} />
        <span className="truncate">{fileName}</span>
      </span>
      {diskChanged && (
        <TextButton className="h-7 text-xs text-orange-700" onClick={reloadFromDisk} title="Discard local edits and load the version on disk">
          Changed on disk: reload
        </TextButton>
      )}
    </>
  );
}

function FileMenu() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = usePopover<HTMLDivElement>(open, close);
  const run = (fn: () => unknown) => () => {
    close();
    void fn();
  };
  return (
    <div className="relative" ref={ref}>
      <TextButton active={open} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        File
        <ChevronDownIcon />
      </TextButton>
      {open && (
        <Popover className="right-0 flex w-64 flex-col p-1.5" role="menu">
          <MenuItem title="New project" onClick={run(() => actions.createProject())} />
          <MenuItem title="Open file…" hint={`${MOD}O · opens as a new project`} onClick={run(openFile)} />
          <div className="mx-1.5 my-1 h-px bg-line" />
          <MenuItem title="Save to file" hint={`${MOD}S · links the file for live sync`} onClick={run(saveFile)} />
          <MenuItem title="Save as…" hint={`${MOD}Shift S`} onClick={run(saveFileAs)} />
          <MenuItem
            title="Download a copy"
            hint=".retrace.json, without linking"
            onClick={run(() => download(new Blob([JSON.stringify(getState().project)], { type: 'application/json' }), projectFileName()))}
          />
        </Popover>
      )}
    </div>
  );
}

function ExportMenu() {
  const exportOpen = useEditor((s) => s.exportMenuOpen);
  const closeExport = useCallback(() => setState({ exportMenuOpen: false }), []);
  const ref = usePopover<HTMLDivElement>(exportOpen, closeExport);
  const [progress, setProgress] = useState<number | null>(null);

  const recordVideo = async (transparent: boolean) => {
    setState({ exportMenuOpen: false, playing: false });
    setProgress(0);
    try {
      const { blob, extension } = await exportVideo(getState().project, { transparent, onProgress: setProgress });
      download(blob, projectFileName(`${transparent ? '-transparent' : ''}.${extension}`));
    } catch (err) {
      setState({ status: err instanceof Error ? err.message : String(err) });
    } finally {
      setProgress(null);
    }
  };

  const svg = (transparent: boolean) => {
    closeExport();
    exportAnimatedSvg(transparent);
  };

  return (
    <div className="relative ml-1" ref={ref}>
      <button
        className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-80"
        aria-expanded={exportOpen}
        aria-haspopup="menu"
        title={`Export (${MOD}E)`}
        onClick={() => setState({ exportMenuOpen: !exportOpen })}
        disabled={progress !== null}
      >
        {progress === null ? (
          <>
            <ExportIcon />
            Export
          </>
        ) : (
          <>
            <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-white/30">
              <span className="absolute inset-y-0 left-0 bg-white" style={{ width: `${progress * 100}%` }} />
            </span>
            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          </>
        )}
      </button>
      {exportOpen && (
        <Popover className="right-0 flex w-64 flex-col p-1.5" role="menu">
          <MenuItem title="Video" hint="MP4 (H.264), every frame, faster than real time" onClick={() => recordVideo(false)} />
          <MenuItem title="Transparent video" hint="WebM VP9 with alpha, for overlays" onClick={() => recordVideo(true)} />
          <div className="mx-1.5 my-1 h-px bg-line" />
          <MenuItem title="Animated SVG" hint="Self-playing, embeds anywhere" onClick={() => svg(false)} />
          <MenuItem title="Animated SVG, transparent" hint="No background" onClick={() => svg(true)} />
        </Popover>
      )}
    </div>
  );
}

export function MenuItem({ title, hint, onClick, danger }: { title: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className={cx('flex flex-col items-start gap-px rounded-lg px-2.5 py-[7px] text-left hover:bg-hover', danger && 'text-red-600')} role="menuitem" onClick={onClick}>
      <span>{title}</span>
      {hint && <span className="text-[11.5px] text-muted">{hint}</span>}
    </button>
  );
}
