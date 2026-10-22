<p align="center">
  <img src="assets/logo-light.svg#gh-light-mode-only" alt="Retrace" width="96" />
  <img src="assets/logo-dark.svg#gh-dark-mode-only" alt="Retrace" width="96" />
</p>

<h1 align="center">Retrace</h1>
<h3 align="center">Draw step by step. Play it back like a human drew it.</h3>

<div align="center">

<img src="assets/editor.png" alt="The Retrace editor showing its hand-lettered alphabet and four stick figures" width="100%" />

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-5B5BD6?style=flat&labelColor=212123" alt="License: Apache-2.0" /></a>
  <a href="#use-it-with-ai-mcp"><img src="https://img.shields.io/badge/MCP-built%20in-5B5BD6?style=flat&labelColor=212123" alt="MCP server built in" /></a>
  <img src="https://img.shields.io/badge/Runs%20in-the%20browser-5B5BD6?style=flat&labelColor=212123" alt="Runs in the browser" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=F8F8F8&labelColor=212123" alt="TypeScript" />
  <a href="https://github.com/jub0t/Retrace/pulls"><img src="https://img.shields.io/badge/PRs-welcome-2F9E44?style=flat&labelColor=212123" alt="PRs welcome" /></a>
</p>

</div>

## About

Retrace is a free, open-source tool for hand-drawn explainer animations: the scrawled-marker, stick-figure style of [cpu.land](https://cpu.land/) and countless YouTube explainers.

You draw one stroke, add a step, draw the next. Every stroke keeps the path and timing of your hand, so playback redraws it exactly the way you drew it. Nothing gets tweened and nothing looks like a template. It looks like a person drew it, because one did.

Or an AI did. Retrace ships an **MCP server**, so Claude and other agents can draw too. A humanizer gives every generated line a natural wobble, overshoot and pen speed. Everything in the screenshot above was drawn by that engine from a few lines of code ([scripts/demo.ts](scripts/demo.ts)). The lettering is Retrace's own single-stroke handwriting, and no font file was involved.

**Good for:** YouTube explainers, thumbnails, tutorials, course videos, blog illustrations, and anything that should feel made by hand.

## Watch it draw itself

<p align="center">
  <img src="assets/demo.svg" alt="The thumbnail above, drawing itself stroke by stroke" width="100%" />
</p>

That is the actual animated SVG export: no video and no script. It's one self-playing file you can drop into any web page. Open [assets/demo.retrace.json](assets/demo.retrace.json) in the editor to see how it was built, step by step.

## Highlights

- ✍️ **Real strokes, real timing.** Each stroke records its path, pressure and timing. Playback redraws it at the speed of the hand.
- 🪜 **Steps, not keyframes.** Each step adds to the drawing. Set how long it holds, give it a name, reorder it.
- 🖌️ **Five brushes.** Marker, ink pen, pencil, brush and highlighter, sized to the half-pixel with a precise slider.
- 🎞️ **A timeline that respects your time.** Frame-accurate scrubbing at 60 fps, frame stepping, loop, onion skin, thumbnails for every step.
- 🔤 **Hand-lettered text.** A built-in single-stroke handwriting font, written one stroke at a time like everything else.
- 🧍 **Stick figures on demand.** Six poses, five faces, three hairstyles, drawn in the order a person would.
- 🤖 **AI-native.** A built-in MCP server lets agents draw, preview their own work as PNG, fix mistakes and export.
- 🔗 **Live link.** Open a project file and watch an agent's edits appear while it works.
- 📤 **Export.** MP4 or WebM video, transparent WebM for overlays, and self-playing animated SVG.
- ⌨️ **Keyboard-first.** Every command has a shortcut. Press <kbd>?</kbd> to see them all.
- 🔒 **Yours.** It runs in your browser, uploads nothing and works offline. Projects are plain JSON files you can diff and share.

## Get started

You need [Node.js](https://nodejs.org/) 20 or newer and [pnpm](https://pnpm.io/) (npm works too).

```sh
git clone https://github.com/jub0t/Retrace.git
cd Retrace
pnpm install
pnpm dev          # the editor, at http://localhost:5173
```

```sh
pnpm build        # static editor in dist/ + MCP server in dist-mcp/
pnpm demo         # regenerate the README drawings from scripts/demo.ts
pnpm screenshot   # re-render assets/editor.png (with pnpm dev running)
pnpm typecheck
```

`dist/` is a plain static site. Host it anywhere (GitHub Pages, Netlify, a USB stick).

## Use it with AI (MCP)

Build the server once:

```sh
pnpm build:mcp
```

**Claude Code** picks it up automatically inside this repo (see [.mcp.json](.mcp.json)). To use it from anywhere:

```sh
claude mcp add retrace -- node /absolute/path/to/Retrace/dist-mcp/server.js
```

**Claude Desktop, Cursor and other MCP clients:**

```json
{
  "mcpServers": {
    "retrace": {
      "command": "node",
      "args": ["/absolute/path/to/Retrace/dist-mcp/server.js"]
    }
  }
}
```

Then ask for something like:

> Make a Retrace explainer in `./fetch.retrace.json`: a stick figure discovers how a CPU fetches and executes instructions. One idea per step, with a hand-lettered title.

To watch it happen, open the same file in the editor with **Open**. Each time the agent saves, the drawing updates.

<details>
<summary><b>Tools the server provides</b></summary>

| Tool | What it does |
| --- | --- |
| `create_project` | New project file (default 1920×1080) |
| `draw` | Draw shapes as humanized strokes, optionally into a new labeled step |
| `render_preview` | A PNG of the drawing up to any step, so the agent can check its work |
| `describe_project` | Steps, labels, stroke counts and bounding boxes |
| `add_step` · `update_step` · `delete_step` | Manage steps, labels and hold times |
| `remove_last_strokes` | Take back a shape that came out wrong |
| `update_project` | Playback speed, background |
| `export_svg` | Animated (or static) SVG |

Shapes: `line`, `arrow`, `polyline`, `curve`, `ellipse`, `rect`, `text` and `stick_figure`, each with optional `color`, `size` and `brush`.

```json
{ "type": "stick_figure", "x": 1440, "y": 1015, "height": 520, "pose": "point", "face": "surprised", "hair": "messy", "facing": "left" }
{ "type": "text", "text": "How does it work?!", "x": 960, "y": 80, "height": 110, "align": "center" }
{ "type": "arrow", "from": [1230, 640], "to": [930, 600], "bend": 0.2, "color": "#e03131" }
```

</details>

## How it works

Generated lines usually look generated. The **humanizer** ([src/core/humanize.ts](src/core/humanize.ts)) turns ideal geometry into strokes that look like a hand made them:

- **Wobble:** a low-frequency sideways wander, pinned at both ends so lines still connect.
- **Pen speed:** each stroke speeds up and slows down along its path, and pauses briefly at corners. The marker gets slightly heavier where the pen moves slowly.
- **Habits:** circles start near the top, run counter-clockwise and close past their start. Endpoints miss by a hair. Each letter gets its own small tilt and drift.
- **Order:** shapes are drawn in the order a person draws them. Head, then body, then arms. Arrow shaft, then head.

A seed makes every result reproducible.

Rendering runs through one shared core, so the editor canvas, the exports and the MCP previews all look identical:

```
src/core/   No DOM. File format, brushes, stroke geometry, timeline,
            humanizer, shapes, handwriting, SVG rendering
src/web/    The editor (React + Tailwind)
src/mcp/    The MCP server (stdio), on the same core
scripts/    The README demo, built with the core API
```

A project is plain JSON: `steps[]`, each holding `strokes[]`, each storing points as `[x, y, pressure, t]`, where `t` is milliseconds since the stroke began. See [src/core/model.ts](src/core/model.ts).

## Roadmap

- [ ] Select tool: pick strokes, move them, and copy/paste across sessions and projects
- [ ] Reusable assets: save a figure once, drop it into any drawing
- [ ] Frame-exact video export (WebCodecs) and GIF
- [ ] Lowercase handwriting and more glyphs
- [ ] Scene cuts, layers, canvas zoom and pan, dark theme
- [ ] A hosted editor and an `npx` package for the MCP server

## How to contribute

> [!IMPORTANT]
> The best way to help is to make something with Retrace, then tell us where it fought you. [Open an issue](https://github.com/jub0t/Retrace/issues) with what you tried and what you expected.
>
> Ready to write code? Run `pnpm dev`, keep `pnpm typecheck` green, and keep the core free of DOM APIs so the editor and the MCP server stay in sync. New shapes, poses, glyphs and brushes are especially welcome: they live in [src/core/](src/core/).

## Star History

<a href="https://www.star-history.com/#jub0t/retrace&Date">
  <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=jub0t/retrace&type=Date" />
</a>

## Contributors

<a href="https://github.com/jub0t/Retrace/graphs/contributors">
  <img alt="Contributors" src="https://contrib.rocks/image?repo=jub0t/retrace" />
</a>

## License

[Apache-2.0](LICENSE)
