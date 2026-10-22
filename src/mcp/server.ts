// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Resvg } from '@resvg/resvg-js';
import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  BRUSH_STYLES,
  FACES,
  HAIRS,
  HANDWRITING_CHARS,
  PALETTE,
  POSES,
  SIZES,
  createProject,
  createRandom,
  createStep,
  getTimeline,
  parseProject,
  renderAnimatedSvg,
  renderSvg,
  shapeToStrokes,
  strokesBounds,
  type Project,
  type Shape,
} from '../core';

const INSTRUCTIONS = `Retrace makes hand-drawn explainer animations (think cpu.land: scrawled black marker on off-white, gray annotations, one accent color).

A project is a JSON file of cumulative steps. Each step adds strokes on top of the previous ones; playback redraws every stroke at human hand speed, then holds.
Canvas: default 1920x1080, origin top-left, units are pixels. Stick figures are ~260px tall by default; leave 80px margins.

Workflow: create_project → for each beat of the explanation: draw (with new_step and a label) → render_preview to check the result → fix with remove_last_strokes if needed → export_svg.
Text: use the text shape for titles and labels (hand-lettered capitals); keep thumbnail titles to a few words at height 90-150.
Style tips: one idea per step; draw in the order a person would (outline before details, arrow after the things it connects); use ${PALETTE[0]} for main ink, ${PALETTE[1]} for annotations/arrows, and at most one accent (${PALETTE[2]} or ${PALETTE[3]}); marker brush for most things, highlighter (size ~24) to emphasize; vary seed so repeated shapes don't look identical.
The user can open the same file in the Retrace web editor (Open → pick the file) to watch changes live.`;

const vec = z.array(z.number()).length(2).describe('[x, y] in project pixels');
const brushArg = z
  .enum(BRUSH_STYLES)
  .optional()
  .describe('marker (default, even felt-tip), pen (tapered ink), pencil (thin, light), brush (calligraphic), highlighter (wide, translucent)');
const style = {
  color: z.string().optional().describe('CSS color; defaults to the draw call color'),
  size: z.number().positive().optional().describe('Nib size in px'),
  brush: brushArg,
};
const shapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('line'), from: vec, to: vec, ...style }),
  z.object({ type: z.literal('arrow'), from: vec, to: vec, bend: z.number().min(-1).max(1).optional().describe('Curve the shaft sideways, -1..1'), ...style }),
  z.object({ type: z.literal('polyline'), points: z.array(vec).min(2), closed: z.boolean().optional(), ...style }).describe('Straight segments with sharp corners, one pen stroke'),
  z.object({ type: z.literal('curve'), points: z.array(vec).min(2), closed: z.boolean().optional(), ...style }).describe('Smooth curve through the points, one pen stroke'),
  z.object({ type: z.literal('ellipse'), center: vec, rx: z.number().positive(), ry: z.number().positive().optional(), ...style }),
  z.object({ type: z.literal('rect'), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), ...style }),
  z
    .object({
      type: z.literal('text'),
      text: z.string().min(1),
      x: z.number().describe('Left edge (or center/right edge, per align)'),
      y: z.number().describe('Top of the capitals'),
      height: z.number().positive().optional().describe('Cap height in px, default 60. Nib defaults to height/10'),
      align: z.enum(['left', 'center', 'right']).optional(),
      ...style,
    })
    .describe(`Hand-lettered capitals, one pen stroke at a time. Supported: ${HANDWRITING_CHARS.trim()} (lowercase is written as capitals)`),
  z.object({
    type: z.literal('stick_figure'),
    x: z.number().describe('Horizontal center'),
    y: z.number().describe('Ground line under the feet'),
    height: z.number().positive().optional().describe('Total height, default 260'),
    pose: z.enum(POSES).optional(),
    face: z.enum(FACES).optional(),
    hair: z.enum(HAIRS).optional().describe('Default none'),
    facing: z.enum(['left', 'right']).optional(),
    ...style,
  }),
]);

const fileArg = z.string().describe('Path to the .retrace.json project file');

const server = new McpServer({ name: 'retrace', version: '0.1.0' }, { instructions: INSTRUCTIONS });

server.registerTool(
  'create_project',
  {
    title: 'Create project',
    description: 'Create a new empty Retrace project file with one empty step.',
    inputSchema: {
      file: fileArg,
      width: z.number().int().positive().optional().describe('Default 1920'),
      height: z.number().int().positive().optional().describe('Default 1080'),
      background: z.string().optional().describe('Default #f8f9fa (off-white)'),
      overwrite: z.boolean().optional().describe('Replace an existing file'),
    },
  },
  tool(async ({ file, overwrite, ...init }) => {
    const path = resolve(file);
    if (existsSync(path) && !overwrite) throw new Error(`${path} already exists (pass overwrite: true to replace it)`);
    const project = createProject(stripUndefined(init));
    await save(path, project);
    return `Created ${path} (${project.width}x${project.height}).\n${describe(project)}`;
  }),
);

server.registerTool(
  'describe_project',
  {
    title: 'Describe project',
    description: 'Summarize a project: canvas size, duration, and each step with its label, stroke count and bounding box.',
    inputSchema: { file: fileArg },
    annotations: { readOnlyHint: true },
  },
  tool(async ({ file }) => describe(await load(file))),
);

server.registerTool(
  'draw',
  {
    title: 'Draw shapes',
    description:
      'Draw shapes into a step as humanized pen strokes (natural wobble, overshoot and hand speed). ' +
      'Shapes are drawn in array order, so list them in the order a person would draw them.',
    inputSchema: {
      file: fileArg,
      shapes: z.array(shapeSchema).min(1),
      step: z.number().int().min(0).optional().describe('Step index to draw into; default is the last step'),
      new_step: z.boolean().optional().describe('Append a new step and draw into it (ignores `step`)'),
      label: z.string().optional().describe('Label for the new step, e.g. "CPU fetches an instruction"'),
      hold: z.number().min(0).optional().describe('Pause after the new step, ms (default 400)'),
      color: z.string().optional().describe(`Default color for these shapes (default ${PALETTE[0]})`),
      size: z.number().positive().optional().describe(`Default nib size (default ${SIZES.medium})`),
      brush: brushArg,
      wobble: z.number().min(0).max(3).optional().describe('0 = ruler-straight, 1 = natural (default), 2+ = scrawly'),
      speed: z.number().positive().optional().describe('Drawing speed in px/ms (default ~1.6)'),
      seed: z.number().int().optional().describe('Random seed for reproducible wobble'),
    },
  },
  tool(async ({ file, shapes, step, new_step, label, hold, color, size, brush, wobble, speed, seed }) => {
    const path = resolve(file);
    const project = await load(path);
    let index = step ?? project.steps.length - 1;
    if (new_step) {
      project.steps.push(createStep(stripUndefined({ label, hold })));
      index = project.steps.length - 1;
    } else if (!project.steps[index]) {
      throw new Error(`No step ${index}; the project has steps 0..${project.steps.length - 1}`);
    }
    const rand = createRandom(seed ?? Date.now());
    const strokes = (shapes as Shape[]).flatMap((shape) => shapeToStrokes(shape, { rand, color, size, brush, wobble, speed }));
    project.steps[index].strokes.push(...strokes);
    await save(path, project);
    const b = strokesBounds(strokes);
    return `Drew ${shapes.length} shape(s) as ${strokes.length} stroke(s) into step ${index}${b ? `, covering x=${b.x} y=${b.y} ${b.width}x${b.height}` : ''}.`;
  }),
);

server.registerTool(
  'add_step',
  {
    title: 'Add step',
    description: 'Insert an empty step. Steps are cumulative: everything drawn in earlier steps stays visible.',
    inputSchema: {
      file: fileArg,
      label: z.string().optional(),
      hold: z.number().min(0).optional().describe('Pause after this step, ms (default 400)'),
      after: z.number().int().min(-1).optional().describe('Insert after this step index; default is at the end, -1 inserts first'),
    },
  },
  tool(async ({ file, label, hold, after }) => {
    const path = resolve(file);
    const project = await load(path);
    const at = after === undefined ? project.steps.length : after + 1;
    project.steps.splice(at, 0, createStep(stripUndefined({ label, hold })));
    await save(path, project);
    return `Added step ${at}. The project now has ${project.steps.length} steps.`;
  }),
);

server.registerTool(
  'update_step',
  {
    title: 'Update step',
    description: 'Change a step\'s label or hold, or clear all of its strokes.',
    inputSchema: {
      file: fileArg,
      step: z.number().int().min(0),
      label: z.string().optional(),
      hold: z.number().min(0).optional(),
      clear: z.boolean().optional().describe('Remove every stroke in the step'),
    },
  },
  tool(async ({ file, step, label, hold, clear }) => {
    const path = resolve(file);
    const project = await load(path);
    const s = getStep(project, step);
    if (label !== undefined) s.label = label;
    if (hold !== undefined) s.hold = hold;
    if (clear) s.strokes = [];
    await save(path, project);
    return `Updated step ${step}.`;
  }),
);

server.registerTool(
  'remove_last_strokes',
  {
    title: 'Remove last strokes',
    description: 'Remove the most recent strokes from a step, to redo a shape that came out wrong.',
    inputSchema: {
      file: fileArg,
      step: z.number().int().min(0).optional().describe('Default is the last step'),
      count: z.number().int().positive().optional().describe('Default 1. A stick figure is 6-9 strokes, an arrow 2.'),
    },
  },
  tool(async ({ file, step, count = 1 }) => {
    const path = resolve(file);
    const project = await load(path);
    const index = step ?? project.steps.length - 1;
    const s = getStep(project, index);
    const removed = s.strokes.splice(Math.max(0, s.strokes.length - count)).length;
    await save(path, project);
    return `Removed ${removed} stroke(s) from step ${index}; ${s.strokes.length} remain.`;
  }),
);

server.registerTool(
  'delete_step',
  {
    title: 'Delete step',
    description: 'Delete a step and its strokes. The last remaining step is cleared instead.',
    inputSchema: { file: fileArg, step: z.number().int().min(0) },
    annotations: { destructiveHint: true },
  },
  tool(async ({ file, step }) => {
    const path = resolve(file);
    const project = await load(path);
    getStep(project, step);
    if (project.steps.length === 1) project.steps[0].strokes = [];
    else project.steps.splice(step, 1);
    await save(path, project);
    return `Deleted step ${step}. ${project.steps.length} step(s) remain.`;
  }),
);

server.registerTool(
  'update_project',
  {
    title: 'Update project',
    description: 'Change project-wide settings.',
    inputSchema: {
      file: fileArg,
      speed: z.number().positive().optional().describe('Playback speed multiplier for all drawing motion'),
      background: z.string().optional(),
    },
  },
  tool(async ({ file, speed, background }) => {
    const path = resolve(file);
    const project = await load(path);
    if (speed !== undefined) project.speed = speed;
    if (background !== undefined) project.background = background;
    await save(path, project);
    return describe(project);
  }),
);

server.registerTool(
  'render_preview',
  {
    title: 'Render preview',
    description: 'Render the drawing as it looks at the end of a step, as a PNG image. Use it to check layout and fix mistakes.',
    inputSchema: {
      file: fileArg,
      step: z.number().int().min(0).optional().describe('Show everything up to and including this step; default is the last step'),
      width: z.number().int().min(200).max(1920).optional().describe('Image width in px (default 960)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ file, step, width = 960 }) => {
    try {
      const project = await load(resolve(file));
      const upto = step ?? project.steps.length - 1;
      getStep(project, upto);
      const png = new Resvg(renderSvg(project, { uptoStep: upto }), { fitTo: { mode: 'width', value: width } }).render().asPng();
      return {
        content: [
          { type: 'image' as const, data: Buffer.from(png).toString('base64'), mimeType: 'image/png' },
          { type: 'text' as const, text: `Steps 0..${upto} of ${project.steps.length}. Image is scaled ${(width / project.width).toFixed(2)}x from project coordinates.` },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'export_svg',
  {
    title: 'Export SVG',
    description: 'Write the project as an SVG file. Animated SVGs replay every stroke at drawing speed (SMIL, no scripts) and play in any browser.',
    inputSchema: {
      file: fileArg,
      out: z.string().describe('Output .svg path'),
      animated: z.boolean().optional().describe('Default true; false writes the finished drawing'),
      transparent: z.boolean().optional().describe('Omit the background'),
      loop: z.boolean().optional().describe('Loop the animation (default true)'),
    },
  },
  tool(async ({ file, out, animated = true, transparent, loop }) => {
    const project = await load(resolve(file));
    const svg = animated ? renderAnimatedSvg(project, { transparent, loop }) : renderSvg(project, { transparent });
    const outPath = resolve(out);
    await writeFile(outPath, svg);
    return `Wrote ${outPath} (${animated ? `animated, ${(getTimeline(project).duration / 1000).toFixed(1)}s` : 'static'}).`;
  }),
);

/* ---------- helpers ---------- */

/** Wrap a handler that returns text, turning thrown errors into MCP tool errors. */
function tool<A>(fn: (args: A) => Promise<string>) {
  return async (args: A) => {
    try {
      return { content: [{ type: 'text' as const, text: await fn(args) }] };
    } catch (err) {
      return errorResult(err);
    }
  };
}

function errorResult(err: unknown) {
  return { isError: true, content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }] };
}

async function load(file: string): Promise<Project> {
  const path = resolve(file);
  if (!existsSync(path)) throw new Error(`${path} does not exist; call create_project first`);
  return parseProject(JSON.parse(await readFile(path, 'utf8')));
}

/** Write atomically so the web editor watching this file never reads half a project. */
async function save(path: string, project: Project): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(project));
  await rename(tmp, path);
}

function getStep(project: Project, index: number) {
  const step = project.steps[index];
  if (!step) throw new Error(`No step ${index}; the project has steps 0..${project.steps.length - 1}`);
  return step;
}

function describe(project: Project): string {
  const timeline = getTimeline(project);
  const lines = [
    `Canvas ${project.width}x${project.height}, background ${project.background}, speed ${project.speed}x, duration ${(timeline.duration / 1000).toFixed(1)}s.`,
    `Steps (${project.steps.length}):`,
    ...project.steps.map((s, i) => {
      const b = strokesBounds(s.strokes);
      const where = b ? ` at x=${b.x} y=${b.y} ${b.width}x${b.height}` : '';
      return `  ${i}. ${s.label ? `"${s.label}" ` : ''}${s.strokes.length} stroke(s)${where}, hold ${s.hold}ms`;
    }),
  ];
  return lines.join('\n');
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

await server.connect(new StdioServerTransport());
