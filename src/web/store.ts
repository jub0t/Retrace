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
  sceneOf,
  sceneStart,
  scenesOf,
  stepEndTime,
  strokeClipboard,
  strokesBounds,
  transformStrokes,
  uid,
  withNewIds,
  type Asset,
  type BrushStyle,
  type Gradient,
  type Project,
  type Step,
  type Stroke,
} from '../core';
import { drawFrame } from './render';
import { listProjects, readPref, readProject, removeProject, writePref, writeProject, type ProjectMeta } from './storage';

export type Tool = 'pen' | 'eraser' | 'select' | 'hand';
export type Screen = 'loading' | 'home' | 'editor';
export type SaveState = 'saved' | 'saving' | 'error';

/** Canvas zoom and pan: the artboard's scale and the screen offset of its top-left corner. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface EditorState {
  screen: Screen;
  /** Every saved project's summary, most recent first. */
  projects: ProjectMeta[];
  /** The open project's id in browser storage; null if storage is unavailable. */
  projectId: string | null;
  projectName: string;
  createdAt: number;
  saveState: SaveState;

  project: Project;
  /** Index of the step being edited. */
  current: number;
  tool: Tool;
  color: string;
  /** When set, new strokes use this gradient instead of the solid color. */
  gradient: Gradient | null;
  /** Recently picked solid colors, newest first. */
  recentColors: string[];
  brush: BrushStyle;
  /** Size of the active brush. */
  size: number;
  /** Each brush remembers its own size. */
  brushSizes: Record<BrushStyle, number>;
  /** Dim earlier steps so the current step's strokes stand out. */
  onion: boolean;
  /** Ids of selected strokes. Any stroke visible while editing can be selected, whatever step it belongs to. */
  selection: ReadonlySet<string>;
  playing: boolean;
  /** Playing the whole film; otherwise playback stays within the current scene. */
  playAll: boolean;
  loop: boolean;
  /** Playback clock in ms. When set, the canvas shows that frame instead of the editor view. */
  playhead: number | null;
  /** Canvas zoom/pan; null fits the artboard to the window. */
  view: View | null;
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
  /** Which tab the right-hand panel shows. */
  panel: 'properties' | 'library';
}

const LEGACY_PROJECT_KEY = 'retrace:project';
const LAST_PROJECT_KEY = 'retrace:last-project';
const LIBRARY_KEY = 'retrace:library';
const RECENT_COLORS_KEY = 'retrace:recent-colors';
const HISTORY_LIMIT = 200;
const SAVE_DELAY = 500;
const THUMB_WIDTH = 360;
const NO_SELECTION: ReadonlySet<string> = new Set();

let state: EditorState = {
  screen: 'loading',
  projects: [],
  projectId: null,
  projectName: 'Untitled',
  createdAt: Date.now(),
  saveState: 'saved',
  project: createProject(),
  current: 0,
  tool: 'pen',
  color: PALETTE[0],
  gradient: null,
  recentColors: loadRecentColors(),
  brush: 'marker',
  size: BRUSHES.marker.defaultSize,
  brushSizes: Object.fromEntries(BRUSH_STYLES.map((b) => [b, BRUSHES[b].defaultSize])) as Record<BrushStyle, number>,
  onion: false,
  selection: NO_SELECTION,
  playing: false,
  playAll: false,
  loop: false,
  playhead: null,
  view: null,
  fileName: null,
  dirty: false,
  diskChanged: false,
  status: null,
  exportMenuOpen: false,
  helpOpen: false,
  library: loadLibrary(),
  panel: 'properties',
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
  scheduleSave();
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

/** First and last step whose strokes are on the canvas while editing `current`. */
export function editableRange(project: Project, current: number): [number, number] {
  return [sceneStart(project, current), current];
}

/** Every stroke visible while editing, with the step it belongs to, in drawing order. */
export function editableStrokes(project: Project, current: number): { stroke: Stroke; step: number }[] {
  const [from, to] = editableRange(project, current);
  const out: { stroke: Stroke; step: number }[] = [];
  for (let i = from; i <= to; i++) for (const stroke of project.steps[i].strokes) out.push({ stroke, step: i });
  return out;
}

function pruneSelection(project: Project, current: number): ReadonlySet<string> {
  if (!state.selection.size) return NO_SELECTION;
  const ids = new Set(editableStrokes(project, current).map(({ stroke }) => stroke.id));
  const kept = [...state.selection].filter((id) => ids.has(id));
  return kept.length ? new Set(kept) : NO_SELECTION;
}

function updateStep(index: number, fn: (step: Step) => Step): Project {
  const steps = state.project.steps.slice();
  steps[index] = fn(steps[index]);
  return { ...state.project, steps };
}

/** Rewrite the strokes of every editable step; steps whose strokes come back unchanged are kept as-is. */
function mapEditable(base: Project, fn: (strokes: Stroke[]) => Stroke[]): Project {
  const [from, to] = editableRange(base, state.current);
  const steps = base.steps.slice();
  for (let i = from; i <= to; i++) {
    const next = fn(steps[i].strokes);
    if (next !== steps[i].strokes) steps[i] = { ...steps[i], strokes: next };
  }
  return { ...base, steps };
}

const currentStep = () => state.project.steps[state.current];

/** Playback start and end time (ms) of the scene that contains `step`. */
export function sceneTimes(project: Project, step: number): [number, number] {
  const { first, last } = sceneOf(project, step);
  const t = getTimeline(project);
  return [t.stepStarts[first], t.stepStarts[last + 1] ?? t.duration];
}

/** Every scene's first step starts a new scene (the very first step included, harmlessly). */
function markSceneStarts(steps: Step[], starts: Set<Step>): Step[] {
  return steps.map((s) => (starts.has(s) && !s.newScene ? { ...s, newScene: true } : s));
}
const stopPreview = { playing: false, playhead: null } as const;

export const actions = {
  /**
   * Pick a solid color for new strokes; with strokes selected, recolor them too.
   * Pass `final: false` while dragging in the picker so the whole drag is one undo step.
   */
  setColor(color: string, final = true) {
    setState({ color, gradient: null, tool: state.tool === 'eraser' || state.tool === 'hand' ? 'pen' : state.tool });
    recolorSelection(color, null, final);
    if (final) rememberColor(color);
  },

  setGradient(gradient: Gradient, final = true) {
    setState({ gradient, color: gradient.stops[0]?.color ?? state.color, tool: state.tool === 'eraser' || state.tool === 'hand' ? 'pen' : state.tool });
    recolorSelection(gradient.stops[0]?.color ?? state.color, gradient, final);
  },

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
    scheduleSave();
  },

  redo() {
    const next = future.pop();
    if (!next) return;
    past.push(state.project);
    setState({ project: next, current: clampStep(next, state.current), selection: NO_SELECTION, dirty: true });
    scheduleSave();
  },

  addStroke(stroke: Stroke) {
    commit(updateStep(state.current, (s) => ({ ...s, strokes: [...s.strokes, stroke] })), { selection: NO_SELECTION });
  },

  /** Remove strokes from any step visible on the canvas. */
  eraseStrokes(ids: ReadonlySet<string>) {
    if (!ids.size) return;
    commit(mapEditable(state.project, (strokes) => (strokes.some((st) => ids.has(st.id)) ? strokes.filter((st) => !ids.has(st.id)) : strokes)));
  },

  /* ---- selection: any stroke visible while editing ---- */

  setSelection(ids: Iterable<string>) {
    const set = new Set(ids);
    setState({ selection: set.size ? set : NO_SELECTION, ...stopPreview });
  },

  selectAll() {
    actions.setSelection(editableStrokes(state.project, state.current).map(({ stroke }) => stroke.id));
  },

  clearSelection() {
    if (state.selection.size) setState({ selection: NO_SELECTION });
  },

  deleteSelection() {
    actions.eraseStrokes(state.selection);
  },

  selectedStrokes(): Stroke[] {
    return editableStrokes(state.project, state.current)
      .filter(({ stroke }) => state.selection.has(stroke.id))
      .map(({ stroke }) => stroke);
  },

  /** Indexes of the steps that hold selected strokes. */
  selectionSteps(): number[] {
    const steps = new Set<number>();
    for (const { stroke, step } of editableStrokes(state.project, state.current)) if (state.selection.has(stroke.id)) steps.add(step);
    return [...steps];
  },

  /**
   * Move/scale the selected strokes of `base` (the project when the drag began).
   * Called live while dragging and once more with `final` to record one undo step.
   */
  transformSelection(base: Project, map: (x: number, y: number) => [number, number], sizeScale: number, final: boolean) {
    const sel = state.selection;
    apply(
      mapEditable(base, (strokes) => {
        if (!strokes.some((st) => sel.has(st.id))) return strokes;
        const byId = new Map(transformStrokes(strokes.filter((st) => sel.has(st.id)), map, sizeScale).map((st) => [st.id, st]));
        return strokes.map((st) => byId.get(st.id) ?? st);
      }),
      final,
    );
  },

  nudgeSelection(dx: number, dy: number) {
    if (!state.selection.size) return;
    actions.transformSelection(state.project, (x, y) => [x + dx, y + dy], 1, true);
  },

  /** Fill the selected strokes' enclosed areas with a color, or remove the fill (null). */
  setSelectionFill(color: string | null) {
    const sel = state.selection;
    if (!sel.size) return;
    commit(
      mapEditable(state.project, (strokes) =>
        strokes.some((st) => sel.has(st.id))
          ? strokes.map((st) => {
              if (!sel.has(st.id)) return st;
              const { fill: _old, ...rest } = st;
              return color ? { ...rest, fill: color } : rest;
            })
          : strokes,
      ),
    );
  },

  /**
   * Restack the selection without changing when it draws: to the front or back of
   * everything on the canvas, or one layer forward/backward.
   */
  arrangeSelection(to: 'front' | 'back' | 'forward' | 'backward') {
    const sel = state.selection;
    if (!sel.size) return;
    const all = editableStrokes(state.project, state.current).map(({ stroke }) => stroke);
    const others = all.filter((st) => !sel.has(st.id)).map((st) => st.layer ?? 0);
    const top = Math.max(0, ...others);
    const bottom = Math.min(0, ...others);
    const layerFor = (st: Stroke) => {
      const l = st.layer ?? 0;
      if (to === 'front') return top + 1;
      if (to === 'back') return bottom - 1;
      return l + (to === 'forward' ? 1 : -1);
    };
    commit(
      mapEditable(state.project, (strokes) =>
        strokes.some((st) => sel.has(st.id))
          ? strokes.map((st) => {
              if (!sel.has(st.id)) return st;
              const { layer: _old, ...rest } = st;
              const layer = layerFor(st);
              return layer ? { ...rest, layer } : rest;
            })
          : strokes,
      ),
    );
  },

  /** Move the selected strokes out of earlier steps into the current one (they then draw at this step). */
  moveSelectionToCurrentStep() {
    const moving = actions.selectedStrokes();
    if (!moving.length) return;
    const ids = state.selection;
    const stripped = mapEditable(state.project, (strokes) => (strokes.some((st) => ids.has(st.id)) ? strokes.filter((st) => !ids.has(st.id)) : strokes));
    const steps = stripped.steps.slice();
    steps[state.current] = { ...steps[state.current], strokes: [...steps[state.current].strokes, ...moving] };
    commit({ ...stripped, steps }, { selection: ids });
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
    const existing = new Set(editableStrokes(state.project, state.current).map(({ stroke: s }) => `${s.points[0]?.[0]},${s.points[0]?.[1]}`));
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
    setState({ panel: 'library', status: `Saved "${asset.name}" to your library` });
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

  /** Add an empty scene after the current one and switch to it. */
  addScene() {
    const { last } = sceneOf(state.project, state.current);
    const steps = state.project.steps.slice();
    steps.splice(last + 1, 0, createStep({ newScene: true }));
    commit({ ...state.project, steps }, { current: last + 1, ...stopPreview });
  },

  /** Switch to a scene, showing it finished (its last step). */
  selectScene(index: number) {
    const scene = scenesOf(state.project)[index];
    if (scene) setState({ current: scene.last, selection: NO_SELECTION, ...stopPreview, playAll: false });
  },

  renameScene(index: number, name: string) {
    const scene = scenesOf(state.project)[index];
    if (!scene || (scene.name ?? '') === name.trim()) return;
    commit(updateStep(scene.first, (s) => ({ ...s, sceneName: name.trim() || undefined })));
  },

  duplicateScene(index: number) {
    const scene = scenesOf(state.project)[index];
    if (!scene) return;
    const copy = state.project.steps.slice(scene.first, scene.last + 1).map((s, i) => ({
      ...s,
      id: uid(),
      strokes: withNewIds(s.strokes),
      ...(i === 0 && { newScene: true, sceneName: s.sceneName && `${s.sceneName} copy` }),
    }));
    const steps = state.project.steps.slice();
    steps.splice(scene.last + 1, 0, ...copy);
    commit({ ...state.project, steps }, { current: scene.last + copy.length, ...stopPreview });
  },

  deleteScene(index: number) {
    const scenes = scenesOf(state.project);
    const scene = scenes[index];
    if (!scene) return;
    if (scenes.length === 1) {
      commit({ ...state.project, steps: [createStep()] }, { current: 0, ...stopPreview });
      return;
    }
    const steps = state.project.steps.filter((_, i) => i < scene.first || i > scene.last);
    const neighbor = scenes[index + 1] ?? scenes[index - 1];
    const starts = new Set(scenes.filter((s) => s !== scene).map((s) => state.project.steps[s.first]));
    const next = markSceneStarts(steps, starts);
    // Land on the neighboring scene's last step.
    const landing = next.indexOf(next.find((s) => s.id === state.project.steps[neighbor.last].id)!);
    commit({ ...state.project, steps: next }, { current: Math.max(0, landing), ...stopPreview });
  },

  /** Move scene `from` so it becomes scene number `to`. */
  moveScene(from: number, to: number) {
    const scenes = scenesOf(state.project);
    if (from === to || !scenes[from] || to < 0 || to >= scenes.length) return;
    const blocks = scenes.map((s) => state.project.steps.slice(s.first, s.last + 1));
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    const starts = new Set(blocks.map((b) => b[0]));
    const steps = markSceneStarts(blocks.flat(), starts);
    const current = blocks.slice(0, to).reduce((n, b) => n + b.length, 0) + moved.length - 1;
    commit({ ...state.project, steps }, { current, ...stopPreview });
  },

  duplicateStep() {
    const step = currentStep();
    const steps = state.project.steps.slice();
    steps.splice(state.current + 1, 0, { ...step, id: uid(), label: step.label && `${step.label} copy`, strokes: withNewIds(step.strokes) });
    commit({ ...state.project, steps }, { current: state.current + 1, ...stopPreview });
  },

  deleteStep(index = state.current) {
    const { project } = state;
    if (project.steps.length === 1) {
      commit(updateStep(0, (s) => ({ ...s, strokes: [] })));
      return;
    }
    const current = state.current >= index ? Math.max(0, state.current - 1) : state.current;
    commit({ ...project, steps: project.steps.filter((_, i) => i !== index) }, { current, ...stopPreview });
  },

  moveStep(delta: -1 | 1) {
    actions.moveStepTo(state.current, state.current + delta);
  },

  /** Move step `from` so it ends up at index `to`, and keep editing it. */
  moveStepTo(from: number, to: number) {
    const { project } = state;
    if (from === to || to < 0 || to >= project.steps.length) return;
    const steps = project.steps.slice();
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    commit({ ...project, steps }, { current: to, ...stopPreview });
  },

  selectStep(i: number) {
    const current = clampStep(state.project, i);
    setState({ current, selection: current === state.current ? state.selection : NO_SELECTION, ...stopPreview });
  },

  setLabel(label: string, index = state.current) {
    const trimmed = label.trim();
    if ((state.project.steps[index].label ?? '') === trimmed) return;
    commit(updateStep(index, (s) => ({ ...s, label: trimmed || undefined })));
  },

  setNewScene(newScene: boolean) {
    commit(updateStep(state.current, (s) => ({ ...s, newScene: newScene || undefined })));
  },

  /** This step's playback speed, on top of the project speed. */
  setStepSpeed(speed: number, final = true) {
    apply(updateStep(state.current, (s) => ({ ...s, speed: Math.abs(speed - 1) < 0.01 ? undefined : speed })), final);
  },

  setHold(hold: number, final = true, index = state.current) {
    apply(updateStep(index, (s) => ({ ...s, hold: Math.max(0, Math.round(hold)) })), final);
  },

  setSpeed(speed: number, final = true) {
    apply({ ...state.project, speed }, final);
  },

  /** Paper color; pass `final: false` while dragging in a picker so the drag is one undo step. */
  setBackground(background: string, final = true) {
    apply({ ...state.project, background }, final);
  },

  setCanvasSize(width: number, height: number) {
    if (width === state.project.width && height === state.project.height) return;
    commit({ ...state.project, width, height }, { view: null });
  },

  /* ---- playback ---- */

  /** Space: play the current scene; pause, resume, or start over once it's finished. */
  togglePlay() {
    if (state.playing) return setState({ playing: false });
    const [start, end] = sceneTimes(state.project, state.current);
    const p = state.playhead;
    const resume = !state.playAll && p !== null && p >= start && p < end - 1;
    setState({ playing: true, playAll: false, playhead: resume ? p : start, selection: NO_SELECTION });
  },

  /** Play the whole film, every scene in order. */
  togglePlayAll() {
    if (state.playing && state.playAll) return setState({ playing: false });
    const { duration } = getTimeline(state.project);
    const p = state.playhead;
    const resume = state.playAll && p !== null && p < duration - 1;
    setState({ playing: true, playAll: true, playhead: resume ? p : 0, selection: NO_SELECTION });
  },

  playFromCurrentStep() {
    setState({ playing: true, playAll: false, playhead: getTimeline(state.project).stepStarts[state.current], selection: NO_SELECTION });
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

  /* ---- the open project's content ---- */

  /** Replace the open project's content, e.g. when its linked file changes on disk. Undoable. */
  loadProject(project: Project, fileName: string | null) {
    commit(project, { current: project.steps.length - 1, fileName, dirty: false, diskChanged: false, selection: NO_SELECTION });
  },

  /* ---- projects in browser storage ---- */

  /** Create a project in storage and open it. */
  async createProject(project: Project = createProject(), name = nextUntitledName()): Promise<string | null> {
    await flushSave();
    const now = Date.now();
    const id = uid();
    try {
      const meta = summarize(id, name, now, now, project);
      await writeProject(meta, project);
      setState({ projects: [meta, ...state.projects] });
      showProject(id, name, now, project);
      return id;
    } catch (err) {
      // No storage: still let the person work, just without autosave.
      showProject(null, name, now, project);
      setState({ saveState: 'error', status: `Couldn't save to this browser: ${errorText(err)}` });
      return null;
    }
  },

  async openProject(id: string) {
    if (id === state.projectId && state.screen === 'editor') return;
    await flushSave();
    const meta = state.projects.find((p) => p.id === id);
    const raw = await readProject(id).catch(() => undefined);
    if (!meta || !raw) {
      setState({ status: "Couldn't open that project from browser storage" });
      return;
    }
    let project: Project;
    try {
      project = parseProject(raw);
    } catch (err) {
      setState({ status: `That project is damaged: ${errorText(err)}` });
      return;
    }
    showProject(id, meta.name, meta.createdAt, project);
  },

  async goHome() {
    await flushSave();
    setState({ screen: 'home', ...stopPreview, selection: NO_SELECTION, exportMenuOpen: false });
    await refreshProjects();
  },

  /** Rename a project; `null` is the open project when browser storage is unavailable. */
  async renameProject(id: string | null, name: string) {
    const trimmed = name.trim() || 'Untitled';
    if (id === state.projectId) {
      if (trimmed === state.projectName) return;
      setState({ projectName: trimmed });
      scheduleSave();
      return;
    }
    const meta = state.projects.find((p) => p.id === id);
    if (!meta || meta.name === trimmed) return;
    const next = { ...meta, name: trimmed };
    setState({ projects: state.projects.map((p) => (p.id === id ? next : p)) });
    await writeProject(next).catch((err) => setState({ status: `Couldn't rename: ${errorText(err)}` }));
  },

  async duplicateProject(id: string) {
    const meta = state.projects.find((p) => p.id === id);
    const raw = await readProject(id).catch(() => undefined);
    if (!meta || !raw) return;
    const now = Date.now();
    const copy = { ...meta, id: uid(), name: `${meta.name} copy`, createdAt: now, updatedAt: now };
    await writeProject(copy, raw);
    await refreshProjects();
  },

  async deleteProject(id: string) {
    await removeProject(id).catch((err) => setState({ status: `Couldn't delete: ${errorText(err)}` }));
    if (id === state.projectId) {
      clearTimeout(saveTimer);
      unsaved = false;
      setState({ projectId: null });
      writePref(LAST_PROJECT_KEY, null);
    }
    setState({ projects: state.projects.filter((p) => p.id !== id) });
  },
};

/* ---- autosave ---- */

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let unsaved = false;

function scheduleSave() {
  if (!state.projectId) return;
  unsaved = true;
  if (state.saveState !== 'saving') setState({ saveState: 'saving' });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), SAVE_DELAY);
}

/** Write pending changes to browser storage now. */
export async function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  const { projectId, project, projectName, createdAt } = state;
  if (!unsaved || !projectId) return;
  unsaved = false;
  try {
    const meta = summarize(projectId, projectName, createdAt, Date.now(), project);
    await writeProject(meta, project);
    const projects = [meta, ...state.projects.filter((p) => p.id !== projectId)];
    setState({ projects, saveState: unsaved ? 'saving' : 'saved' });
  } catch (err) {
    unsaved = true;
    setState({ saveState: 'error', status: `Couldn't save to this browser: ${errorText(err)}. Save to a file to keep your work.` });
  }
}

let initializing: Promise<void> | null = null;

/** Load storage, carry over the old single-project autosave, and reopen the last project. Runs once. */
export function initStorage(): Promise<void> {
  initializing ??= init();
  return initializing;
}

async function init(): Promise<void> {
  try {
    await migrateLegacyAutosave();
    await refreshProjects();
    const last = readPref<string | null>(LAST_PROJECT_KEY, null);
    if (last && state.projects.some((p) => p.id === last)) await actions.openProject(last);
    if (state.screen === 'loading') setState({ screen: 'home' });
  } catch (err) {
    showProject(null, 'Untitled', Date.now(), createProject());
    setState({ saveState: 'error', status: `Browser storage is unavailable (${errorText(err)}). Save to a file to keep your work.` });
  }
}

async function refreshProjects() {
  try {
    setState({ projects: await listProjects() });
  } catch {
    // Keep the list we have.
  }
}

async function migrateLegacyAutosave() {
  const raw = localStorage.getItem(LEGACY_PROJECT_KEY);
  if (!raw) return;
  try {
    const project = parseProject(JSON.parse(raw));
    if (project.steps.some((s) => s.strokes.length)) {
      const now = Date.now();
      await writeProject(summarize(uid(), 'Recovered drawing', now, now, project), project);
    }
  } catch {
    // Unreadable leftovers: nothing worth keeping.
  }
  localStorage.removeItem(LEGACY_PROJECT_KEY);
}

function showProject(id: string | null, name: string, createdAt: number, project: Project) {
  past = [];
  future = [];
  gestureBase = null;
  clearTimeout(saveTimer);
  unsaved = false;
  setState({
    screen: 'editor',
    projectId: id,
    projectName: name,
    createdAt,
    project,
    current: project.steps.length - 1,
    selection: NO_SELECTION,
    ...stopPreview,
    view: null,
    fileName: null,
    dirty: false,
    diskChanged: false,
    saveState: 'saved',
  });
  writePref(LAST_PROJECT_KEY, id);
}

function summarize(id: string, name: string, createdAt: number, updatedAt: number, project: Project): ProjectMeta {
  const { duration } = getTimeline(project);
  return { id, name, createdAt, updatedAt, thumbnail: thumbnail(project), width: project.width, height: project.height, steps: project.steps.length, duration };
}

/** The final frame, small, for the projects screen. */
function thumbnail(project: Project): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_WIDTH;
    canvas.height = Math.round((THUMB_WIDTH * project.height) / project.width);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(THUMB_WIDTH / project.width, THUMB_WIDTH / project.width);
    drawFrame(ctx, project, getTimeline(project).duration);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return undefined;
  }
}

function nextUntitledName(): string {
  const taken = new Set(state.projects.map((p) => p.name));
  if (!taken.has('Untitled')) return 'Untitled';
  let n = 2;
  while (taken.has(`Untitled ${n}`)) n++;
  return `Untitled ${n}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function parseProjectJson(text: string): Project {
  return parseProject(JSON.parse(text));
}

function recolorSelection(color: string, gradient: Gradient | null, final: boolean) {
  if (!state.selection.size || state.playhead !== null) return;
  const sel = state.selection;
  // One gradient across the whole selection, not one per stroke.
  const box = gradient ? strokesBounds(actions.selectedStrokes()) : null;
  if (gradient && box) gradient = { ...gradient, box };
  apply(
    mapEditable(state.project, (strokes) =>
      strokes.some((st) => sel.has(st.id))
        ? strokes.map((st) => {
            if (!sel.has(st.id)) return st;
            const { gradient: _old, ...rest } = st;
            return gradient ? { ...rest, color, gradient } : { ...rest, color };
          })
        : strokes,
    ),
    final,
  );
}

function rememberColor(color: string) {
  const recent = [color, ...state.recentColors.filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, 10);
  setState({ recentColors: recent });
  writePref(RECENT_COLORS_KEY, recent);
}

function loadRecentColors(): string[] {
  const raw = readPref<unknown>(RECENT_COLORS_KEY, []);
  return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string').slice(0, 10) : [];
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
