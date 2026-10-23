// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { scenesOf, stepRate, strokeDuration, strokeZ, trackIndex, tracksOf, type Project, type Stroke } from './model';

/** Frame rate for scrubbing and video export. */
export const FPS = 60;
export const FRAME_MS = 1000 / FPS;

/**
 * Pen-lift pause between consecutive strokes inside one step, at 1× speed (it scales with
 * the step's rate like the strokes do). Real gaps (thinking time) are dropped.
 */
export const STROKE_GAP = 120;

export interface TimedStroke {
  stroke: Stroke;
  step: number;
  /** Playback time (ms) when this stroke starts drawing. */
  start: number;
  /** Playback duration (ms), i.e. recorded duration divided by the step's rate. */
  duration: number;
  /** Recorded ms per playback ms: project speed times the step's speed. */
  rate: number;
  /** Playback time (ms) when a later scene wipes this stroke away; Infinity if never. */
  end: number;
  /** Stacking key: track, then the stroke's own layer. */
  z: number;
}

export interface TimedScene {
  first: number;
  last: number;
  start: number;
  end: number;
}

export interface Timeline {
  duration: number;
  /** Strokes on visible tracks, by start time. */
  strokes: TimedStroke[];
  /** Playback time at which each step begins. */
  stepStarts: number[];
  /** When each step's strokes finish (its hold begins). */
  drawEnds: number[];
  /** When each step's hold ends. */
  stepEnds: number[];
  scenes: TimedScene[];
}

const cache = new WeakMap<Project, Timeline>();

/**
 * Lays every stroke out on one playback clock. Scenes play one after another. Inside a
 * scene each track plays its steps in order, all tracks starting together, and the scene
 * lasts until its longest track is done. Cached per (immutable) project object.
 */
export function getTimeline(project: Project): Timeline {
  const cached = cache.get(project);
  if (cached) return cached;

  const hidden = tracksOf(project).map((t) => !!t.hidden);
  const strokes: TimedStroke[] = [];
  const stepStarts: number[] = [];
  const drawEnds: number[] = [];
  const stepEnds: number[] = [];
  const scenes: TimedScene[] = [];
  let t = 0;
  for (const { first, last } of scenesOf(project)) {
    const sceneStrokes: TimedStroke[] = [];
    const trackTime = new Map<number, number>();
    for (let i = first; i <= last; i++) {
      const step = project.steps[i];
      const track = trackIndex(project, step);
      let u = (trackTime.get(track) ?? t) + Math.max(0, step.delay ?? 0);
      stepStarts[i] = u;
      const rate = stepRate(project, step);
      step.strokes.forEach((stroke, j) => {
        if (j > 0) u += STROKE_GAP / rate;
        const duration = strokeDuration(stroke) / rate;
        if (!hidden[track]) sceneStrokes.push({ stroke, step: i, start: u, duration, rate, end: Infinity, z: strokeZ(track, stroke) });
        u += duration;
      });
      drawEnds[i] = u;
      u += step.hold;
      stepEnds[i] = u;
      trackTime.set(track, u);
    }
    const end = Math.max(t, ...trackTime.values());
    const isLast = last === project.steps.length - 1;
    for (const s of sceneStrokes) s.end = isLast ? Infinity : end;
    // Stable, so strokes starting together keep their step order.
    strokes.push(...sceneStrokes.sort((a, b) => a.start - b.start));
    scenes.push({ first, last, start: t, end });
    t = end;
  }

  const timeline = { duration: t, strokes, stepStarts, drawEnds, stepEnds, scenes };
  cache.set(project, timeline);
  return timeline;
}

/** Playback time at which a step finishes drawing (before its hold). */
export function stepEndTime(project: Project, step: number): number {
  return getTimeline(project).drawEnds[step] ?? 0;
}

/** The step that most recently started at `time`. */
export function stepAt(timeline: Timeline, time: number): number {
  let best = 0;
  timeline.stepStarts.forEach((s, i) => {
    if (s <= time && s >= timeline.stepStarts[best]) best = i;
  });
  return best;
}

/** The scene playing at `time`, as an index into `timeline.scenes`. */
export function sceneAt(timeline: Timeline, time: number): number {
  const i = timeline.scenes.findIndex((s) => time < s.end);
  return i === -1 ? timeline.scenes.length - 1 : i;
}

/**
 * The steps on the canvas while editing `step`: everything in its scene that has started
 * by the time it finishes drawing, on tracks that aren't hidden. The editing equivalent
 * of pausing at the end of the step.
 */
export function stepsShownWhileEditing(project: Project, step: number): number[] {
  const timeline = getTimeline(project);
  const scene = timeline.scenes.find((s) => step >= s.first && step <= s.last);
  if (!scene) return [];
  const hidden = tracksOf(project).map((t) => !!t.hidden);
  const out: number[] = [];
  for (let i = scene.first; i <= scene.last; i++) {
    if (hidden[trackIndex(project, project.steps[i])]) continue;
    if (i === step || timeline.stepStarts[i] < timeline.drawEnds[step]) out.push(i);
  }
  return out;
}

/** Each stroke visible at `time`, with how far into its recorded motion it has drawn. */
export function* visibleStrokes(timeline: Timeline, time: number): Generator<{ stroke: Stroke; elapsed: number; z: number }> {
  for (const s of timeline.strokes) {
    if (s.start > time) return;
    if (time >= s.end) continue;
    yield { stroke: s.stroke, elapsed: (time - s.start) * s.rate, z: s.z };
  }
}

/** A step's number in its scene, counting from 1 in the order steps start (ties by track, bottom first). */
export function stepNumber(project: Project, step: number): number {
  const timeline = getTimeline(project);
  const scene = timeline.scenes.find((s) => step >= s.first && step <= s.last);
  if (!scene) return step + 1;
  const key = (i: number) => [timeline.stepStarts[i], trackIndex(project, project.steps[i]), i];
  const [t, k, i] = key(step);
  let n = 1;
  for (let j = scene.first; j <= scene.last; j++) {
    const [tj, kj] = key(j);
    if (tj < t || (tj === t && (kj < k || (kj === k && j < i)))) n++;
  }
  return n;
}
