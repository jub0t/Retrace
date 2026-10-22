# Drawmation

Draw step by step, then play it back exactly the way a hand drew it.

Drawmation is a free, open-source tool for hand-drawn explainer animations, in the style of [cpu.land](https://cpu.land/): scrawled marker strokes, gray notes, one accent color. Every stroke keeps its pen path and timing, so the animation looks human rather than like a motion-graphics template. You can draw with a mouse, pen or touch, or have an AI agent draw for you over MCP.

## Features

- **Steps.** Each step adds strokes on top of the ones before it. Playback draws each stroke at the speed it was drawn, then holds for that step's hold time.
- **Brushes.** Marker, ink pen, pencil, brush and highlighter, each with a precise size slider.
- **Timeline.** Thumbnail cells, a frame-accurate scrubber (60 fps), frame stepping, loop, onion skin, per-step hold and labels, and a global speed control.
- **Editing.** Undo/redo, plus select all, copy/cut/paste and nudge within a step.
- **Export.** Video (MP4/WebM), transparent WebM for overlays, and self-playing animated SVG.
- **AI-native.** An MCP server lets agents draw humanized shapes (lines, arrows, curves, boxes, ellipses, stick figures with poses and faces) and look at their own work through PNG previews.
- **Live link.** Open a project file in the editor and watch an AI agent's edits appear as they happen (Chromium browsers).
- **Private and offline.** Runs entirely in the browser. Projects are plain JSON files.

## Quick start

```bash
pnpm install     # or npm install
pnpm dev         # editor at http://localhost:5173
pnpm build       # static editor in dist/ + MCP server in dist-mcp/
```

Press <kbd>?</kbd> in the editor to see every shortcut.

## Using it with AI (MCP)

Build the server once with `pnpm build:mcp`, then register it with your MCP client.

**Claude Code:** this repo includes `.mcp.json`, so the server is picked up automatically inside the project. To use it from anywhere:

```bash
claude mcp add drawmation -- node /absolute/path/to/drawmation/dist-mcp/server.js
```

**Claude Desktop and other clients:**

```json
{
  "mcpServers": {
    "drawmation": { "command": "node", "args": ["/absolute/path/to/drawmation/dist-mcp/server.js"] }
  }
}
```

Then ask something like *"Make a Drawmation animation in ./cpu.drawmation.json explaining the fetch-execute cycle with a stick figure."* To watch it being drawn, open that file in the editor (**Open**). The editor reloads it whenever the agent saves.

| Tool | What it does |
| --- | --- |
| `create_project` | New project file (default 1920×1080) |
| `draw` | Draw shapes as humanized strokes, optionally into a new labeled step |
| `render_preview` | PNG of the drawing up to a step, so the agent can check its work |
| `describe_project` | Steps, labels, stroke counts and bounding boxes |
| `add_step` / `update_step` / `delete_step` | Manage steps, labels and hold times |
| `remove_last_strokes` | Undo a shape that came out wrong |
| `update_project` | Playback speed, background |
| `export_svg` | Animated (or static) SVG |

The humanizer makes generated strokes look hand-drawn:

- **Wobble:** a low-frequency sideways wander, pinned at both ends.
- **Hand motion:** the pen speeds up and slows down along each stroke, with a short pause at corners.
- **Overshoot:** circles start near the top and run past their starting point.
- **Stroke order:** shapes are drawn the way a person would draw them.

A seed makes every drawing reproducible.

## Project layout

```
src/core/   Pure TypeScript, no DOM: file format, brushes, stroke geometry,
            playback timeline, humanizer + shapes, SVG rendering
src/web/    The editor (React + Tailwind)
src/mcp/    MCP server (stdio), built on the same core
```

The same core renders the editor canvas, exports and MCP previews, so they all match.

### File format

A `.drawmation.json` file stores `steps[]`. Each step holds `strokes[]`, and each stroke stores its points as `[x, y, pressure, t]`, where `t` is milliseconds since the stroke started. See [src/core/model.ts](src/core/model.ts).

## Roadmap

- Frame-exact video export (WebCodecs) and GIF
- Handwritten and typed text
- Selection tool (lasso, move, scale), layers, and scene cuts that clear the board
- Canvas zoom and pan, and a dark theme
- MCP video export and a published `npx` package

## License

[Apache-2.0](LICENSE)
