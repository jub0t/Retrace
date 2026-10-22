/**
 * Builds the README demo, a YouTube-explainer-style thumbnail, with the core API (the
 * same one the MCP server uses) and writes it to assets/. Run with `pnpm demo`.
 * Fixed seeds keep the output identical between runs.
 */
import { writeFileSync } from 'node:fs';
import {
  createProject,
  createRandom,
  createStep,
  measureText,
  renderAnimatedSvg,
  renderSvg,
  shapeToStrokes,
  type Project,
  type Shape,
  type Vec,
} from '../src/core';

const INK = '#1e1e1e';
const GRAY = '#868e96';
const RED = '#e03131';
const YELLOW = '#f59f00';
const BLUE = '#1c7ed6';
const ACCENT = '#5b5bd6';

/** Binary digits, hand-lettered. */
function binary(bits: string, x: number, y: number, h: number): Shape {
  return { type: 'text', text: bits, x, y, height: h, size: h / 7.5 };
}

/** Evenly spaced pins on all four sides of a square package. */
function pins(x: number, y: number, size: number, n: number, len: number): Shape[] {
  const out: Shape[] = [];
  const at = (i: number) => size * (0.12 + (0.76 * i) / (n - 1));
  for (let i = 0; i < n; i++) out.push({ type: 'line', from: [x + at(i), y], to: [x + at(i), y - len] });
  for (let i = 0; i < n; i++) out.push({ type: 'line', from: [x + size, y + at(i)], to: [x + size + len, y + at(i)] });
  for (let i = n - 1; i >= 0; i--) out.push({ type: 'line', from: [x + at(i), y + size], to: [x + at(i), y + size + len] });
  for (let i = n - 1; i >= 0; i--) out.push({ type: 'line', from: [x, y + at(i)], to: [x - len, y + at(i)] });
  return out;
}

/** Short lines radiating from a point: the comic "shock" burst. */
function burst([cx, cy]: Vec, r0: number, r1: number, angles: number[]): Shape[] {
  return angles.map((deg): Shape => {
    const a = (deg * Math.PI) / 180;
    return { type: 'line', from: [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], to: [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1] };
  });
}

const TITLE_RIGHT = 1850;
// "WORK?!" set as one group, right-aligned with the line above.
const WORK_X = TITLE_RIGHT - measureText('WORK ?!', 150) + 30;

/** "How does a CPU actually work?!" as a stick-figure explainer thumbnail. */
function scene(): Project {
  const project = createProject({ speed: 1.8 });
  const chip = { x: 290, y: 400, size: 420 };
  const cx = chip.x + chip.size / 2;
  const cy = chip.y + chip.size / 2;
  // Stick figure geometry (mirrors the engine's proportions) for placing details.
  const fig = { x: 1440, y: 1015, h: 520 };
  const headR = fig.h * 0.11;
  const head: Vec = [fig.x, fig.y - fig.h + headR];

  const beats: { label: string; hold?: number; size?: number; shapes: Shape[] }[] = [
    {
      label: 'the CPU',
      size: 11,
      shapes: [
        { type: 'rect', x: chip.x, y: chip.y, width: chip.size, height: chip.size },
        { type: 'ellipse', center: [chip.x + 38, chip.y + 38], rx: 9, size: 7 },
      ],
    },
    { label: 'its pins', size: 6, shapes: pins(chip.x, chip.y, chip.size, 7, 34) },
    {
      label: 'the mystery inside',
      size: 8,
      shapes: [
        { type: 'rect', x: cx - 105, y: cy - 105, width: 210, height: 210, color: GRAY },
        { type: 'text', text: '??', x: cx, y: cy - 48, height: 96, align: 'center', color: GRAY },
        { type: 'line', from: [chip.x + chip.size - 70, chip.y + 22], to: [chip.x + chip.size - 22, chip.y + 70], color: GRAY, size: 6 },
        { type: 'line', from: [chip.x + chip.size - 44, chip.y + 20], to: [chip.x + chip.size - 20, chip.y + 44], color: GRAY, size: 6 },
      ],
    },
    {
      label: 'binary pours in',
      shapes: [
        binary('01101001', 150, 70, 64),
        binary('00101101', 196, 164, 64),
        { type: 'line', from: [132, 104], to: [590, 99], brush: 'highlighter', size: 50, color: YELLOW },
        { type: 'arrow', from: [620, 200], to: [560, 352], bend: -0.35, color: GRAY, size: 7 },
      ],
    },
    {
      label: 'our hero',
      hold: 400,
      size: 12,
      shapes: [
        { type: 'stick_figure', x: fig.x, y: fig.y, height: fig.h, pose: 'point', face: 'surprised', hair: 'messy', facing: 'left' },
        { type: 'line', from: [fig.x - 150, fig.y + 6], to: [fig.x + 160, fig.y + 4], color: GRAY, size: 6 },
      ],
    },
    {
      label: 'panic',
      size: 7,
      shapes: [
        ...burst(head, headR * 1.75, headR * 2.35, [-158, -132, -106]),
        ...burst(head, headR * 1.75, headR * 2.35, [-74, -48, -22]),
        // A sweat drop: pointed top, round bottom.
        { type: 'curve', points: [[head[0] + headR * 1.55, head[1] - headR * 0.35], [head[0] + headR * 1.35, head[1] + headR * 0.1], [head[0] + headR * 1.55, head[1] + headR * 0.32], [head[0] + headR * 1.75, head[1] + headR * 0.1], [head[0] + headR * 1.55, head[1] - headR * 0.35]], color: BLUE, size: 6 },
      ],
    },
    {
      label: 'the classic red circle',
      size: 12,
      shapes: [
        { type: 'ellipse', center: [cx, cy], rx: 330, ry: 320, color: RED },
        { type: 'arrow', from: [fig.x - 210, 640], to: [cx + 360, cy - 20], bend: 0.22, color: RED },
      ],
    },
    {
      label: 'the title',
      hold: 3500,
      shapes: [
        { type: 'text', text: 'HOW DOES IT', x: TITLE_RIGHT, y: 80, height: 92, align: 'right' },
        { type: 'text', text: 'WORK', x: WORK_X, y: 214, height: 150 },
        { type: 'text', text: '?!', x: WORK_X + measureText('WORK ', 150) - 30, y: 214, height: 150, color: RED },
        { type: 'line', from: [WORK_X - 24, 332], to: [TITLE_RIGHT + 10, 326], brush: 'highlighter', size: 56, color: YELLOW },
      ],
    },
  ];
  project.steps = beats.map((beat, i) => {
    const rand = createRandom(300 + i);
    return createStep({
      label: beat.label,
      hold: beat.hold ?? 250,
      strokes: beat.shapes.flatMap((shape) => shapeToStrokes(shape, { rand, color: INK, size: beat.size })),
    });
  });
  return project;
}

/** The mark: a hand-drawn play button over a scribble, drawn by the humanizer itself. */
function logo(ink: string): Project {
  const project = createProject({ width: 256, height: 256 });
  const rand = createRandom(7);
  project.steps[0].strokes = (
    [
      { type: 'polyline', points: [[92, 60], [92, 170], [186, 115]], closed: true, color: ACCENT, size: 14 },
      { type: 'curve', points: [[40, 214], [90, 196], [140, 222], [216, 200]], color: ink, size: 11 },
    ] as Shape[]
  ).flatMap((shape) => shapeToStrokes(shape, { rand, wobble: 0.8 }));
  return project;
}

const demo = scene();
writeFileSync('assets/demo.drawmation.json', JSON.stringify(demo));
writeFileSync('assets/demo.svg', renderAnimatedSvg(demo, { tail: 0 }));
writeFileSync('assets/thumbnail.svg', renderSvg(demo));
writeFileSync('assets/logo-light.svg', renderSvg(logo(INK), { transparent: true }));
writeFileSync('assets/logo-dark.svg', renderSvg(logo('#f1f3f5'), { transparent: true }));
console.log('wrote assets/: demo.drawmation.json, demo.svg, thumbnail.svg, logo-light.svg, logo-dark.svg');
