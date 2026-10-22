// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { renderAnimatedSvg } from '../core';
import { actions, getState, parseProjectJson, setState } from './store';

/*
 * In Chromium browsers the File System Access API lets the editor keep a handle to the
 * project file. Saving writes back to it, and changes made on disk (e.g. by an AI agent
 * through the MCP server) are picked up live. Other browsers fall back to upload/download.
 */

interface Writable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<Writable>;
}
interface PickerWindow {
  showOpenFilePicker?: (opts: object) => Promise<FileHandle[]>;
  showSaveFilePicker?: (opts: object) => Promise<FileHandle>;
}

const fs = window as unknown as PickerWindow;
const TYPES = [{ description: 'Retrace project', accept: { 'application/json': ['.json'] } }];
const SUGGESTED_NAME = 'animation.retrace.json';

let handle: FileHandle | null = null;
let lastModified = 0;

export async function openFile(): Promise<void> {
  try {
    if (fs.showOpenFilePicker) {
      const [h] = await fs.showOpenFilePicker({ types: TYPES });
      const file = await h.getFile();
      const project = parseProjectJson(await file.text());
      handle = h;
      lastModified = file.lastModified;
      actions.loadProject(project, h.name);
    } else {
      const file = await pickFileFallback();
      if (file) actions.loadProject(parseProjectJson(await file.text()), null);
    }
  } catch (err) {
    reportError(err);
  }
}

export async function saveFile(): Promise<void> {
  const json = JSON.stringify(getState().project);
  try {
    if (!handle && fs.showSaveFilePicker) handle = await fs.showSaveFilePicker({ suggestedName: SUGGESTED_NAME, types: TYPES });
    if (handle) {
      const w = await handle.createWritable();
      await w.write(json);
      await w.close();
      lastModified = (await handle.getFile()).lastModified;
      setState({ fileName: handle.name, dirty: false, diskChanged: false, status: `Saved ${handle.name}` });
    } else {
      download(new Blob([json], { type: 'application/json' }), SUGGESTED_NAME);
      setState({ dirty: false });
    }
  } catch (err) {
    reportError(err);
  }
}

/** Save to a newly chosen file (and link to it from now on). */
export async function saveFileAs(): Promise<void> {
  const previous = handle;
  handle = null;
  await saveFile();
  handle ??= previous; // picker cancelled: stay linked to the old file
}

export function unlinkFile(): void {
  handle = null;
}

export async function reloadFromDisk(): Promise<void> {
  if (!handle) return;
  try {
    const file = await handle.getFile();
    lastModified = file.lastModified;
    actions.loadProject(parseProjectJson(await file.text()), handle.name);
  } catch (err) {
    reportError(err);
  }
}

/**
 * `?open=<url>` loads a project from a link (e.g. an example in the repo), then drops the
 * parameter so a reload doesn't load it again. Loading is undoable like any open.
 */
export async function openFromUrlParam(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const url = params.get('open');
  if (!url) return;
  params.delete('open');
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Couldn't open ${url} (${res.status})`);
    actions.loadProject(parseProjectJson(await res.text()), null);
  } catch (err) {
    reportError(err);
  }
}

/** Poll the linked file; reload it if it changed and there are no local edits to lose. */
export function watchLinkedFile(): () => void {
  const id = setInterval(async () => {
    if (!handle) return;
    try {
      const file = await handle.getFile();
      if (file.lastModified === lastModified) return;
      lastModified = file.lastModified;
      if (getState().dirty) setState({ diskChanged: true });
      else actions.loadProject(parseProjectJson(await file.text()), handle.name);
    } catch {
      // Mid-write or temporarily unreadable; try again on the next tick.
    }
  }, 1000);
  return () => clearInterval(id);
}

export function exportAnimatedSvg(transparent: boolean): void {
  const svg = renderAnimatedSvg(getState().project, { transparent });
  download(new Blob([svg], { type: 'image/svg+xml' }), 'animation.svg');
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFileFallback(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function reportError(err: unknown) {
  if (err instanceof DOMException && err.name === 'AbortError') return; // picker cancelled
  setState({ status: err instanceof Error ? err.message : String(err) });
}
