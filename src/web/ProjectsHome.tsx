// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useCallback, useEffect, useState } from 'react';
import { createProject } from '../core';
import { download, openFile } from './files';
import { ChevronDownIcon, FolderIcon, MoreIcon, PlusIcon } from './icons';
import { CANVAS_PRESETS, formatClock } from './Inspector';
import { readProject, type ProjectMeta } from './storage';
import { actions, setState, useEditor } from './store';
import { Logo, MenuItem, MenuSeparator, ThemeToggle } from './TopBar';
import { IconButton, Popover, PrimaryButton, TextButton, cx } from './ui';
import { usePopover } from './usePopover';

/** Every project saved in this browser, newest first. */
export function ProjectsHome() {
  const projects = useEditor((s) => s.projects);
  const openId = useEditor((s) => s.projectId);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-panel px-6">
        <Logo className="size-6" />
        <span className="text-[15px] font-bold tracking-tight">Retrace</span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <TextButton className="bg-field" onClick={openFile} title="Open a .retrace.json file as a new project">
            <FolderIcon />
            Open file
          </TextButton>
          <NewProjectButton />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="mb-6 flex items-baseline gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            {projects.length > 0 && <span className="text-muted tabular-nums">{projects.length}</span>}
          </div>
          {projects.length === 0 ? (
            <div className="grid place-items-center rounded-panel bg-panel px-6 py-24 text-center shadow-island">
              <p className="mb-1.5 text-lg font-semibold">No projects yet</p>
              <p className="mb-6 text-muted">Start drawing, or open a .retrace.json file.</p>
              <PrimaryButton onClick={() => void actions.createProject()}>
                <PlusIcon />
                New project
              </PrimaryButton>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
              {projects.map((p) => (
                <ProjectCard key={p.id} meta={p} wasOpen={p.id === openId} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NewProjectButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = usePopover<HTMLDivElement>(open, close);
  return (
    <div className="relative flex" ref={ref}>
      <PrimaryButton className="rounded-r-none pl-3" onClick={() => void actions.createProject()} title="New 16:9 project">
        <PlusIcon />
        New project
      </PrimaryButton>
      <button
        className="grid h-8 w-8 place-items-center rounded-r-ctl border-l border-on-ink/20 bg-ink text-on-ink transition-colors hover:bg-ink-hover"
        aria-label="New project with another canvas size"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDownIcon />
      </button>
      {open && (
        <Popover className="right-0 flex w-60 flex-col p-1.5" role="menu">
          {CANVAS_PRESETS.map((p) => (
            <MenuItem
              key={p.label}
              title={p.label}
              hint={`${p.width} × ${p.height}`}
              onClick={() => {
                close();
                void actions.createProject(createProject({ width: p.width, height: p.height }));
              }}
            />
          ))}
        </Popover>
      )}
    </div>
  );
}

function ProjectCard({ meta, wasOpen }: { meta: ProjectMeta; wasOpen: boolean }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeMenu = useCallback(() => {
    setMenu(false);
    setConfirmDelete(false);
  }, []);
  const menuRef = usePopover<HTMLDivElement>(menu, closeMenu);

  const downloadCopy = async () => {
    closeMenu();
    const project = await readProject(meta.id).catch(() => undefined);
    if (!project) return setState({ status: "Couldn't read that project" });
    download(new Blob([JSON.stringify(project)], { type: 'application/json' }), `${meta.name.replace(/[\\/:*?"<>|]+/g, '-')}.retrace.json`);
  };

  return (
    <div className={cx('group relative flex flex-col rounded-panel bg-panel shadow-island transition-shadow hover:shadow-pop', wasOpen && 'ring-2 ring-accent')}>
      <button className="block aspect-video overflow-hidden rounded-t-panel border-b border-line bg-well" onClick={() => void actions.openProject(meta.id)} title={`Open ${meta.name}`}>
        {meta.thumbnail ? (
          <img src={meta.thumbnail} alt="" className="size-full object-contain" draggable={false} />
        ) : (
          <span className="grid size-full place-items-center text-faint">Empty</span>
        )}
      </button>
      <div className="flex items-center gap-1 py-3 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              defaultValue={meta.name}
              className="-mx-1 h-7 w-full rounded-ctl bg-field px-1 font-medium ring-1 ring-accent outline-none select-text"
              onBlur={(e) => {
                setRenaming(false);
                void actions.renameProject(meta.id, e.currentTarget.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setRenaming(false);
              }}
            />
          ) : (
            <p className="truncate font-medium" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
              {meta.name}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted">
            {formatClock(meta.duration)} · <RelativeTime time={meta.updatedAt} />
          </p>
        </div>
        <div className="relative" ref={menuRef}>
          <IconButton
            className={cx('transition-opacity', !menu && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100')}
            aria-label={`More actions for ${meta.name}`}
            aria-expanded={menu}
            active={menu}
            onClick={() => setMenu(!menu)}
          >
            <MoreIcon />
          </IconButton>
          {menu && (
            <Popover className="right-0 flex w-48 flex-col p-1.5" role="menu">
              <MenuItem title="Open" onClick={() => void actions.openProject(meta.id)} />
              <MenuItem
                title="Rename"
                onClick={() => {
                  closeMenu();
                  setRenaming(true);
                }}
              />
              <MenuItem
                title="Duplicate"
                onClick={() => {
                  closeMenu();
                  void actions.duplicateProject(meta.id);
                }}
              />
              <MenuItem title="Download file" onClick={() => void downloadCopy()} />
              <MenuSeparator />
              <MenuItem
                danger
                title={confirmDelete ? 'Click again to delete forever' : 'Delete'}
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  closeMenu();
                  void actions.deleteProject(meta.id);
                }}
              />
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function RelativeTime({ time }: { time: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const s = (time - Date.now()) / 1000;
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    Math.abs(s) < 45 ? [0, 'second'] : Math.abs(s) < 3600 ? [Math.round(s / 60), 'minute'] : Math.abs(s) < 86400 ? [Math.round(s / 3600), 'hour'] : [Math.round(s / 86400), 'day'];
  return <span title={new Date(time).toLocaleString()}>{value === 0 && unit === 'second' ? 'just now' : relative.format(value, unit)}</span>;
}
