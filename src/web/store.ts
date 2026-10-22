// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useSyncExternalStore } from 'react';
import {
  BRUSHES,
  BRUSH_STYLES,
  FRAME_MS,
  PALETTE,
  createAsset,
  createProject,
  createStep,
  getTimeline,
  parseAssets,
  parseClipboard,
  parseProject,
  placeAsset,
  stepEndTime,
  strokeClipboard,
  transformStrokes,
  uid,
  withNewIds,
  type Asset,
  type BrushStyle,
  type Project,
  type Step,
  type Stroke,
} from '../core';

export type Tool = 'pen' | 'eraser' | 'select';

export interface EditorState {
  project: Project;
  /** Index of the step being edited. */
  current: number;
  tool: Tool;
  color: string;
  brush: BrushStyle;
  /** Size of the active brush. */
  size: number;
  /** Each brush remembers its own size. */
  brushSizes: Record<BrushStyle, number>;
  /** Dim earlier steps so the current step's strokes stand out. */
  onion: boolean;
  /** Ids of selected strokes in the current step. */
  selection: ReadonlySet<string>;
  playing: boolean;
  loop: boolean;
  /** Playback clock in ms. When set, the canvas shows that frame instead of the editor view. */
  playhead: number | null;
  /** Name of the file on disk this project is linked to, if any. */
  fileName: string | null;
  /** Local edits not yet written to the linked file. */
  dirty: boolean;
  /** The linked file changed on disk while there were local edits. */
  diskChanged: boolean;
  status: string | null;
  exportMenuOpen: boolean;
  helpOpen: boolean;
  /** Saved objects, kept in this browser. */
  library: Asset[];
  libraryOpen: boolean;
}

const STORAGE_KEY = 'retrace:project';
const LIBRARY_KEY = 'retrace:library';
const HISTORY_LIMIT = 200;
const NO_SELECTION: ReadonlySet<string> = new Set();

const initialProject = loadAutosave();
let state: EditorState = {
  project: initialProject,
  current: initialProject.steps.length - 1,
  tool: 'pen',
  color: PALETTE[0],
  brush: 'marker',
  size: BRUSHES.marker.defaultSize,
  brushSizes: Object.fromEntries(BRUSH_STYLES.map((b) => [b, BRUSHES[b].defaultSize])) as Record<BrushStyle, number>,
  onion: false,
  selection: NO_SELECTION,
  playing: false,
  loop: false,
  playhead: null,
  fileName: null,
  dirty: false,
  diskChanged: false,
  status: null,
  exportMenuOpen: false,
  helpOpen: false,
  library: loadLibrary(),
  libraryOpen: false,
};

const listeners = new Set<() => void>();
let past: Project[] = [];
let future: Project[] = [];
/** Project before a continuous gesture (slider drag) began; the whole gesture is one undo step. */
let gestureBase: Project | null = null;

export function getState(): EditorState {
  return state;
}

export function setState(patch: Partial<EditorState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/** Replace the project as one undoable change. */
function commit(project: Project, patch: Partial<EditorState> = {}): void {
  past.push(gestureBase ?? state.project);
  gestureBase = null;
  if (past.length > HISTORY_LIMIT) past.shift();
  future = [];
  const current = clampStep(project, patch.current ?? state.current);
  setState({ dirty: true, selection: pruneSelection(project, current), ...patch, project, current });
  scheduleAutosave();
}

/** Apply a change live; `final` closes the gesture into a single history entry. */
function apply(project: Project, final: boolean): void {
  if (final) {
    commit(project);
  } else {
    gestureBase ??= state.project;
    setState({ project });
  }
}

function clampStep(project: Project, i: number): number {
  return Math.max(0, Math.min(project.steps.length - 1, i));
}

function pruneSelection(project: Project, current: number): ReadonlySet<string> {
  if (!state.selection.size) return NO_SELECTION;
  const ids = new Set(project.steps[current]?.strokes.map((s) => s.id));
  const kept = [...state.selection].filter((id) => ids.has(id));
  return kept.length ? new Set(kept) : NO_SELECTION;
}

function updateStep(index: number, fn: (step: Step) => Step): Project {
  const steps = state.project.steps.slice();
  steps[index] = fn(steps[index]);
  return { ...state.project, steps };
}

const currentStep = () => state.project.steps[state.current];
const stopPreview = { playing: false, playhead: null } as const;

export const actions = {
  setBrush(brush: BrushStyle) {
    setState({ brush, size: state.brushSizes[brush], tool: 'pen' });
  },

  setSize(size: number) {
    const s = Math.round(Math.max(1, Math.min(48, size)) * 2) / 2;
    setState({ size: s, brushSizes: { ...state.brushSizes, [state.brush]: s }, tool: 'pen' });
  },

  undo() {
    const prev = past.pop();
    if (!prev) return;
    future.push(state.project);
    setState({ project: prev, current: clampStep(prev, state.current), selection: NO_SELECTION, dirty: true });
    scheduleAutosave();
  },

  redo() {
    const next = future.pop();
    if (!next) return;
    past.push(state.project);
    setState({ project: next, current: clampStep(next, state.current), selection: NO_SELECTION, dirty: true });
    scheduleAutosave();
  },

  addStroke(stroke: Stroke) {
    commit(updateStep(state.current, (s) => ({ ...s, strokes: [...s.strokes, stroke] })), { selection: NO_SELECTION });
  },

  eraseStrokes(ids: ReadonlySet<string>) {
    if (!ids.size) return;
    commit(updateStep(state.current, (s) => ({ ...s, strokes: s.strokes.filter((st) => !ids.has(st.id)) })));
  },

  /* ---- selection (current step only) ---- */

  setSelection(ids: Iterable<string>) {
    const set = new Set(ids);
    setState({ selection: set.size ? set : NO_SELECTION, ...stopPreview });
  },

  selectAll() {
    actions.setSelection(currentStep().strokes.map((s) => s.id));
  },

  clearSelection() {
    if (state.selection.size) setState({ selection: NO_SELECTION });
  },

  deleteSelection() {
    actions.eraseStrokes(state.selection);
  },

  selectedStrokes(): Stroke[] {
    return currentStep().strokes.filter((s) => state.selection.has(s.id));
  },

  /**
   * Move/scale the selected strokes of `base` (the project when the drag began).
   * Called live while dragging and once more with `final` to record one undo step.
   */
  transformSelection(base: Project, map: (x: number, y: number) => [number, number], sizeScale: number, final: boolean) {
    const sel = state.selection;
    const step = base.steps[state.current];
    const moved = transformStrokes(step.strokes.filter((st) => sel.has(st.id)), map, sizeScale);
    const byId = new Map(moved.map((st) => [st.id, st]));
    const steps = base.steps.slice();
    steps[state.current] = { ...step, strokes: step.strokes.map((st) => byId.get(st.id) ?? st) };
    apply({ ...base, steps }, final);
  },

  nudgeSelection(dx: number, dy: number) {
    if (!state.selection.size) return;
    actions.transformSelection(state.project, (x, y) => [x + dx, y + dy], 1, true);
  },

  /* ---- clipboard: plain JSON text, so it works across tabs, sessions and projects ---- */

  /** The selection as clipboard text, or null when nothing is selected. */
  selectionClipboard(): string | null {
    const strokes = actions.selectedStrokes();
    return strokes.length ? strokeClipboard(strokes) : null;
  },

  /** Paste Retrace strokes or an object from clipboard text. Returns false if it isn't ours. */
  pasteText(text: string): boolean {
    const data = parseClipboard(text);
    if (!data) return false;
    if (data.type === 'retrace/asset') {
      actions.insertAsset(data);
      return true;
    }
    // Paste in place, nudged if an identical copy is already sitting there.
    const existing = new Set(currentStep().strokes.map((s) => `${s.points[0]?.[0]},${s.points[0]?.[1]}`));
    const overlaps = data.strokes.some((s) => existing.has(`${s.points[0]?.[0]},${s.points[0]?.[1]}`));
    const pasted = withNewIds(overlaps ? transformStrokes(data.strokes, (x, y) => [x + 24, y + 24]) : data.strokes);
    actions.addStrokes(pasted);
    return true;
  },

  /** Append strokes to the current step and select them. */
  addStrokes(strokes: Stroke[]) {
    commit(
      updateStep(state.current, (s) => ({ ...s, strokes: [...s.strokes, ...strokes] })),
      { selection: new Set(strokes.map((s) => s.id)), ...stopPreview, tool: 'select' },
    );
  },

  /* ---- library of saved objects ---- */

  saveSelectionAsAsset(name: string): Asset | null {
    const strokes = actions.selectedStrokes();
    if (!strokes.length) return null;
    const asset = createAsset(name, strokes);
    setLibrary([asset, ...state.library]);
    setState({ libraryOpen: true, status: `Saved "${asset.name}" to your library` });
    return asset;
  },

  /** Place a copy of an object into the current step, centered at (x, y) or the artboard center. */
  insertAsset(asset: Asset, x = state.project.width / 2, y = state.project.height / 2) {
    actions.addStrokes(placeAsset(asset, x, y));
  },

  renameAsset(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLibrary(state.library.map((a) => (a.id === id ? { ...a, name: trimmed } : a)));
  },

  deleteAsset(id: string) {
    setLibrary(state.library.filter((a) => a.id !== id));
  },

  /** Add objects from an imported file; returns how many were added. */
  importAssets(json: string): number {
    const incoming = parseAssets(JSON.parse(json));
    const known = new Set(state.library.map((a) => a.id));
    const fresh = incoming.map((a) => (known.has(a.id) ? { ...a, id: uid() } : a));
    setLibrary([...fresh, ...state.library]);
    return fresh.length;
  },

  /* ---- steps ---- */

  addStep() {
    const steps = state.project.steps.slice();
    steps.splice(state.current + 1, 0, createStep());
    commit({ ...state.project, steps }, { current: state.current + 1, ...stopPreview });
  },

  deleteStep() {
    const { project, current } = state;
    if (project.steps.length === 1) {
      commit(updateStep(0, (s) => ({ ...s, strokes: [] })));
      return;
    }
    commit({ ...project, steps: project.steps.filter((_, i) => i !== current) }, { current: current - 1, ...stopPreview });
  },

  moveStep(delta: -1 | 1) {
    const { project, current } = state;
    const to = current + delta;
    if (to < 0 || to >= project.steps.length) return;
    const steps = project.steps.slice();
    [steps[current], steps[to]] = [steps[to], steps[current]];
    commit({ ...project, steps }, { current: to });
  },

  selectStep(i: number) {
    const current = clampStep(state.project, i);
    setState({ current, selection: current === state.current ? state.selection : NO_SELECTION, ...stopPreview });
  },

  setLabel(label: string) {
    const trimmed = label.trim();
    if ((currentStep().label ?? '') === trimmed) return;
    commit(updateStep(state.current, (s) => ({ ...s, label: trimmed || undefined })));
  },

  setHold(hold: number, final = true) {
    apply(updateStep(state.current, (s) => ({ ...s, hold })), final);
  },

  setSpeed(speed: number, final = true) {
    apply({ ...state.project, speed }, final);
  },

  /* ---- playback ---- */

  /** Space: pause, resume from the playhead, or start over once finished. */
  togglePlay() {
    if (state.playing) return setState({ playing: false });
    const { duration } = getTimeline(state.project);
    const resume = state.playhead !== null && state.playhead < duration - 1;
    setState({ playing: true, playhead: resume ? state.playhead : 0, selection: NO_SELECTION });
  },

  playFromCurrentStep() {
    setState({ playing: true, playhead: getTimeline(state.project).stepStarts[state.current], selection: NO_SELECTION });
  },

  scrub(time: number) {
    setState({ playing: false, playhead: time, selection: NO_SELECTION });
  },

  /** Step the playhead by whole frames; from the editor view, starts where the current step ends. */
  stepFrame(delta: number) {
    const { duration } = getTimeline(state.project);
    const from = state.playhead ?? stepEndTime(state.project, state.current);
    const frame = Math.round(from / FRAME_MS) + delta;
    actions.scrub(Math.max(0, Math.min(duration, frame * FRAME_MS)));
  },

  /** Back to editing the current step. */
  exitPreview() {
    if (state.playhead !== null) setState(stopPreview);
  },

  /* ---- files ---- */

  newProject() {
    commit(createProject(), { current: 0, fileName: null, diskChanged: false, ...stopPreview });
  },

  /** Load a project from a file; undoable so an accidental open can be reverted. */
  loadProject(project: Project, fileName: string | null) {
    commit(project, { current: project.steps.length - 1, fileName, dirty: false, diskChanged: false, selection: NO_SELECTION });
  },
};

export function parseProjectJson(text: string): Project {
  return parseProject(JSON.parse(text));
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleAutosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    } catch {
      // Storage full or blocked (private mode): autosave is a convenience, not a guarantee.
    }
  }, 400);
}

function setLibrary(library: Asset[]) {
  setState({ library });
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    setState({ status: "Couldn't save the library in this browser (storage full or blocked). Export it to keep it." });
  }
}

function loadLibrary(): Asset[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) return parseAssets(JSON.parse(raw));
  } catch {
    // Unreadable library: start empty rather than failing to load the editor.
  }
  return [];
}

function loadAutosave(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseProjectJson(raw);
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  return createProject();
}
