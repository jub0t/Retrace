// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback, useState } from 'react';
import { exportVideo } from './exportVideo';
import { download, exportAnimatedSvg, openFile, reloadFromDisk, saveFile, unlinkFile } from './files';
import { HelpIcon } from './icons';
import { actions, getState, setState, useEditor } from './store';
import { IconButton, Island, Popover, TextButton, cx } from './ui';
import { usePopover } from './usePopover';

export function MenuBar() {
  const fileName = useEditor((s) => s.fileName);
  const dirty = useEditor((s) => s.dirty);
  const diskChanged = useEditor((s) => s.diskChanged);
  const status = useEditor((s) => s.status);
  const exportOpen = useEditor((s) => s.exportMenuOpen);
  const closeExport = useCallback(() => setState({ exportMenuOpen: false }), []);
  const exportRef = usePopover<HTMLDivElement>(exportOpen, closeExport);
  const [progress, setProgress] = useState<number | null>(null);

  const recordVideo = async (transparent: boolean) => {
    setState({ exportMenuOpen: false, playing: false });
    setProgress(0);
    try {
      const { blob, extension } = await exportVideo(getState().project, { transparent, onProgress: setProgress });
      download(blob, `animation${transparent ? '-transparent' : ''}.${extension}`);
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
    <Island className="absolute top-3 left-3 flex items-center gap-0.5 p-1">
      <TextButton
        title="New project (undoable)"
        onClick={() => {
          unlinkFile();
          actions.newProject();
        }}
      >
        New
      </TextButton>
      <TextButton title="Open (Ctrl/⌘ O)" onClick={openFile}>
        Open
      </TextButton>
      <TextButton title="Save (Ctrl/⌘ S) · Save as (Ctrl/⌘ Shift S)" onClick={saveFile}>
        Save
      </TextButton>
      <div className="relative" ref={exportRef}>
        <TextButton
          active={exportOpen}
          aria-expanded={exportOpen}
          aria-haspopup="menu"
          title="Export (Ctrl/⌘ E)"
          onClick={() => setState({ exportMenuOpen: !exportOpen })}
          disabled={progress !== null}
        >
          {progress === null ? (
            'Export'
          ) : (
            <>
              <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-line">
                <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${progress * 100}%` }} />
              </span>
              <span className="tabular-nums">{Math.round(progress * 100)}%</span>
            </>
          )}
        </TextButton>
        {exportOpen && (
          <Popover className="left-0 flex w-64 flex-col p-1.5" role="menu">
            <MenuItem title="Video" hint="MP4 where supported, else WebM" onClick={() => recordVideo(false)} />
            <MenuItem title="Transparent video" hint="WebM with alpha, for overlays" onClick={() => recordVideo(true)} />
            <div className="mx-1.5 my-1 h-px bg-line" />
            <MenuItem title="Animated SVG" hint="Self-playing, embeds anywhere" onClick={() => svg(false)} />
            <MenuItem title="Animated SVG, transparent" hint="No background" onClick={() => svg(true)} />
            <p className="mx-2.5 mt-1.5 mb-1 text-[11px] text-faint">Video records in real time; keep this tab visible.</p>
          </Popover>
        )}
      </div>
      <IconButton title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setState({ helpOpen: true })}>
        <HelpIcon />
      </IconButton>
      {fileName && (
        <span className="inline-flex items-center gap-1.5 px-2 whitespace-nowrap text-muted" title="Linked file: saves write here, and outside changes (e.g. from an AI agent) load live">
          <span className={cx('size-[7px] rounded-full', dirty ? 'bg-amber-500' : 'bg-emerald-600')} />
          {fileName}
        </span>
      )}
      {diskChanged && (
        <TextButton className="text-orange-700" onClick={reloadFromDisk} title="Discard local edits and load the version on disk">
          Changed on disk: reload
        </TextButton>
      )}
      {status && (
        <button className="max-w-72 truncate px-2 text-muted" onClick={() => setState({ status: null })} title="Dismiss">
          {status}
        </button>
      )}
    </Island>
  );
}

function MenuItem({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button className="flex flex-col items-start gap-px rounded-lg px-2.5 py-[7px] text-left hover:bg-hover" role="menuitem" onClick={onClick}>
      <span>{title}</span>
      <span className="text-[11.5px] text-muted">{hint}</span>
    </button>
  );
}
