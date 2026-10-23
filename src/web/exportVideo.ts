// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, canEncodeVideo, getFirstEncodableVideoCodec } from 'mediabunny';
import { FPS, FRAME_MS, getTimeline, strokeDuration, visibleStrokes, type Project } from '../core';
import { drawFrame } from './render';

const TAIL_MS = 1200;

export interface VideoExportOptions {
  transparent: boolean;
  onProgress?: (fraction: number) => void;
}

/**
 * Renders every frame and encodes it with WebCodecs, as fast as the machine allows (far
 * faster than real time, and it doesn't matter whether the tab is visible). MP4 (H.264
 * where available), or WebM VP9 with alpha for transparent video. Browsers without
 * WebCodecs fall back to recording playback in real time.
 */
export async function exportVideo(project: Project, opts: VideoExportOptions): Promise<{ blob: Blob; extension: string }> {
  if (typeof VideoEncoder === 'undefined') return recordRealtime(project, opts);

  const { width, height } = project;
  const format = opts.transparent ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' });
  const codec = opts.transparent
    ? (await canEncodeVideo('vp9', { width, height, alpha: 'keep' })) && 'vp9'
    : await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height });
  if (!codec) return recordRealtime(project, opts);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: opts.transparent })!;

  const output = new Output({ format, target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH, keyFrameInterval: 2, ...(opts.transparent && { alpha: 'keep' as const }) });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();

  const timeline = getTimeline(project);
  const frames = Math.ceil((timeline.duration + TAIL_MS) / FRAME_MS);
  let last = '';
  let lastYield = performance.now();
  for (let i = 0; i < frames; i++) {
    const t = Math.min(i * FRAME_MS, timeline.duration);
    // Holds are runs of identical frames: only repaint when something is mid-stroke or the
    // set of visible strokes changed. The encoder still gets every frame.
    const state = frameState(timeline, t);
    if (state !== last || state.endsWith('*')) drawFrame(ctx, project, t, opts.transparent);
    last = state;
    await source.add(i / FPS, 1 / FPS);
    if (performance.now() - lastYield > 50) {
      opts.onProgress?.(i / frames);
      await new Promise((r) => setTimeout(r, 0)); // let the progress bar paint
      lastYield = performance.now();
    }
  }
  source.close();
  await output.finalize();
  opts.onProgress?.(1);

  const buffer = (output.target as BufferTarget).buffer!;
  return { blob: new Blob([buffer], { type: format.mimeType }), extension: format.fileExtension.replace(/^\./, '') };
}

/** What a frame shows: how many strokes are up, and `*` if one is still being drawn. */
function frameState(timeline: ReturnType<typeof getTimeline>, t: number): string {
  let count = 0;
  let drawing = false;
  for (const { stroke, elapsed } of visibleStrokes(timeline, t)) {
    count++;
    if (elapsed < strokeDuration(stroke)) drawing = true;
  }
  return `${count}${drawing ? '*' : ''}`;
}

/** Fallback: record playback with MediaRecorder. Real time, and needs the tab visible. */
async function recordRealtime(project: Project, opts: VideoExportOptions): Promise<{ blob: Blob; extension: string }> {
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
