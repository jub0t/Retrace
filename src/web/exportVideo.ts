// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { FPS, getTimeline, type Project } from '../core';
import { drawFrame } from './render';

const TAIL_MS = 1200;

/**
 * Records playback to a video file with MediaRecorder. This runs in real time and needs
 * the tab to stay visible. (A frame-exact WebCodecs exporter is on the roadmap.)
 */
export async function exportVideo(
  project: Project,
  opts: { transparent: boolean; onProgress?: (fraction: number) => void },
): Promise<{ blob: Blob; extension: string }> {
  const mimeType = pickMimeType(opts.transparent);
  if (!mimeType) throw new Error('This browser cannot record video. Try Chrome or Edge.');

  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext('2d', { alpha: opts.transparent })!;
  const timeline = getTimeline(project);
  const total = timeline.duration + TAIL_MS;

  const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType, videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));

  drawFrame(ctx, project, 0, opts.transparent);
  recorder.start();
  await new Promise<void>((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const t = performance.now() - t0;
      drawFrame(ctx, project, Math.min(t, timeline.duration), opts.transparent);
      opts.onProgress?.(Math.min(1, t / total));
      if (t >= total) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;

  return { blob: new Blob(chunks, { type: mimeType }), extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

function pickMimeType(transparent: boolean): string | undefined {
  // Only VP8/VP9 WebM can carry an alpha channel.
  const candidates = transparent
    ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    : ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}
