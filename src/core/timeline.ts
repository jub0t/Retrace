import { strokeDuration, type Project, type Stroke } from './model';

/** Frame rate for scrubbing and video export. */
export const FPS = 60;
export const FRAME_MS = 1000 / FPS;

/**
 * Pen-lift pause between consecutive strokes inside one step, at 1× speed (it scales with
 * project speed like the strokes do). Real gaps (thinking time) are dropped.
 */
export const STROKE_GAP = 120;

export interface TimedStroke {
  stroke: Stroke;
  step: number;
  /** Playback time (ms) when this stroke starts drawing. */
  start: number;
  /** Playback duration (ms), i.e. recorded duration divided by project speed. */
  duration: number;
}

export interface Timeline {
  duration: number;
  speed: number;
  strokes: TimedStroke[];
  /** Playback time at which each step begins. */
  stepStarts: number[];
}

const cache = new WeakMap<Project, Timeline>();

/** Lays every stroke out on one playback clock. Cached per (immutable) project object. */
export function getTimeline(project: Project): Timeline {
  const cached = cache.get(project);
  if (cached) return cached;

  const strokes: TimedStroke[] = [];
  const stepStarts: number[] = [];
  let t = 0;
  project.steps.forEach((step, i) => {
    stepStarts.push(t);
    step.strokes.forEach((stroke, j) => {
      if (j > 0) t += STROKE_GAP / project.speed;
      const duration = strokeDuration(stroke) / project.speed;
      strokes.push({ stroke, step: i, start: t, duration });
      t += duration;
    });
    t += step.hold;
  });

  const timeline = { duration: t, speed: project.speed, strokes, stepStarts };
  cache.set(project, timeline);
  return timeline;
}

/** Playback time at which a step finishes drawing (before its hold). */
export function stepEndTime(project: Project, step: number): number {
  const timeline = getTimeline(project);
  return (timeline.stepStarts[step + 1] ?? timeline.duration) - project.steps[step].hold;
}

/** Index of the step playing at `time`. */
export function stepAt(timeline: Timeline, time: number): number {
  let i = 0;
  while (i + 1 < timeline.stepStarts.length && timeline.stepStarts[i + 1] <= time) i++;
  return i;
}

/** Each stroke visible at `time`, with how far into its recorded motion it has drawn. */
export function* visibleStrokes(timeline: Timeline, time: number): Generator<{ stroke: Stroke; elapsed: number }> {
  for (const s of timeline.strokes) {
    if (s.start > time) return;
    yield { stroke: s.stroke, elapsed: (time - s.start) * timeline.speed };
  }
}
