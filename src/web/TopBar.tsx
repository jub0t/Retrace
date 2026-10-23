// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback, useState } from 'react';
import { exportVideo } from './exportVideo';
import { download, exportAnimatedSvg, openFile, projectFileName, reloadFromDisk, saveFile, saveFileAs } from './files';
import { ChevronDownIcon, ExportIcon, HelpIcon, MoonIcon, RedoIcon, SunIcon, UndoIcon } from './icons';
import { actions, getState, setState, useEditor } from './store';
import { toggleTheme, useTheme } from './theme';
import { CommitInput, Divider, IconButton, Popover, PrimaryButton, TextButton, cx } from './ui';
import { usePopover } from './usePopover';

const LOGO_LIGHT = new URL('../../assets/logo-light.svg', import.meta.url).href;
const LOGO_DARK = new URL('../../assets/logo-dark.svg', import.meta.url).href;
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';

/** Project identity and file actions across the top of the editor. */
export function TopBar() {
  const projectId = useEditor((s) => s.projectId);
  const projectName = useEditor((s) => s.projectName);

  return (
    <header className="flex h-12 items-center gap-1.5 border-b border-line bg-panel px-3">
      <TextButton className="pl-2" title="All projects" onClick={() => void actions.goHome()}>
        <Logo />
        <span className="text-muted max-[700px]:hidden">Projects</span>
      </TextButton>
      <span className="text-faint">/</span>
      <CommitInput
        value={projectName}
        aria-label="Project name"
        title="Rename project"
        className="w-[min(280px,30vw)] bg-transparent font-semibold hover:bg-field"
        onCommit={(name) => void actions.renameProject(projectId, name)}
      />
      <SaveStatus />
      <LinkedFile />

      <div className="ml-auto flex items-center gap-1">
        <IconButton title={`Undo (${MOD}Z)`} aria-label="Undo" onClick={actions.undo}>
          <UndoIcon />
        </IconButton>
        <IconButton title={`Redo (${MOD}Shift Z)`} aria-label="Redo" onClick={actions.redo}>
          <RedoIcon />
        </IconButton>
        <Divider />
        <FileMenu />
        <IconButton title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setState({ helpOpen: true })}>
          <HelpIcon />
        </IconButton>
        <ThemeToggle />
        <ExportMenu />
      </div>
    </header>
  );
}

export function Logo({ className = 'size-5' }: { className?: string }) {
  return <img src={useTheme() === 'dark' ? LOGO_DARK : LOGO_LIGHT} alt="" className={className} />;
}

export function ThemeToggle() {
  const dark = useTheme() === 'dark';
  return (
    <IconButton title={dark ? 'Light theme' : 'Dark theme'} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}

function SaveStatus() {
  const saveState = useEditor((s) => s.saveState);
  const stored = useEditor((s) => s.projectId !== null);
  const trouble = !stored || saveState === 'error';
  const label = !stored ? 'Not saved in browser' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? "Couldn't save" : 'Saved';
  // Quiet while everything is fine; colour only when something needs doing.
  return (
    <span
      className={cx('px-1 text-xs whitespace-nowrap', trouble ? 'text-danger' : 'text-faint')}
      title={stored ? 'Every change is saved in this browser automatically' : 'Browser storage is unavailable: save to a file to keep your work'}
    >
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
        className="ml-1 inline-flex h-7 max-w-56 items-center gap-1.5 rounded-full bg-field px-2.5 text-xs text-muted max-[900px]:hidden"
        title="Linked file: Save writes here, and outside changes (e.g. from an AI agent) load live"
      >
        <span className={cx('size-[6px] shrink-0 rounded-full', dirty ? 'bg-accent' : 'bg-faint')} />
        <span className="truncate">{fileName}</span>
      </span>
      {diskChanged && (
        <TextButton className="h-7 bg-accent-soft font-medium text-accent" onClick={reloadFromDisk} title="Changed on disk. Discards local edits and loads the file.">
          Reload from disk
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
        <Popover className="right-0 flex w-60 flex-col p-1.5" role="menu">
          <MenuItem title="New project" onClick={run(() => actions.createProject())} />
          <MenuItem title="Open file…" hint={`${MOD}O`} onClick={run(openFile)} />
          <MenuSeparator />
          <MenuItem title="Save to file" hint={`${MOD}S`} onClick={run(saveFile)} />
          <MenuItem title="Save as…" hint={`${MOD}⇧S`} onClick={run(saveFileAs)} />
          <MenuItem
            title="Download a copy"
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
      <PrimaryButton
        className="disabled:opacity-80"
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
            <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-on-ink/20">
              <span className="absolute inset-y-0 left-0 bg-on-ink" style={{ width: `${progress * 100}%` }} />
            </span>
            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          </>
        )}
      </PrimaryButton>
      {exportOpen && (
        <Popover className="right-0 flex w-60 flex-col p-1.5" role="menu">
          <MenuItem title="Video" hint="MP4" onClick={() => recordVideo(false)} />
          <MenuItem title="Transparent video" hint="WebM" onClick={() => recordVideo(true)} />
          <MenuSeparator />
          <MenuItem title="Animated SVG" hint="SVG" onClick={() => svg(false)} />
          <MenuItem title="Transparent SVG" hint="SVG" onClick={() => svg(true)} />
        </Popover>
      )}
    </div>
  );
}

/** One line: what it does, and on the right a shortcut or format. */
export function MenuItem({ title, hint, onClick, danger }: { title: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={cx('flex h-8 items-center justify-between gap-4 rounded-ctl px-2.5 text-left', danger ? 'text-danger hover:bg-danger-soft' : 'hover:bg-hover')}
      role="menuitem"
      onClick={onClick}
    >
      <span className="truncate">{title}</span>
      {hint && <span className="shrink-0 text-xs text-faint">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="mx-2.5 my-1 h-px bg-line" />;
}
