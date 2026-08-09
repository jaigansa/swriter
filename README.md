# SWriter — Screenwriting Studio

A dependency-free, offline-first **static web application** for writing screenplays in
[Fountain](https://fountain.io) markup, with industry-standard screenplay PDF export.

Everything runs in the browser: no backend, no build step, no Node.js. All data stays in
your browser (IndexedDB with a localStorage fallback).

---

## Quick start (one command)

```bash
./start.sh
# open http://localhost:8080
```

Or with a different port:

```bash
PORT=8081 ./start.sh
```

That is the whole setup. Any static server works too (`python3 -m http.server 8080`,
GitHub Pages, Vercel, Netlify, Nginx…), and you can even double-click `index.html` to run
fully offline.

## Project structure

```
swriter/
├── index.html          # single-page shell (topbar, sidebar, page canvas, scripts)
├── start.sh            # one-command local server (python3 http.server)
├── css/
│   └── styles.css      # dark/light themes, page view, editor overlay, all UI
└── js/
    ├── ui.js           # SVG icons, DOM helpers, modals, toasts
    ├── db.js           # IndexedDB persistence + localStorage fallback
    ├── caret.js        # caret-pixel measurement (editor overlay + autocomplete)
    ├── fountain.js     # Fountain parser and element classifier
    ├── pdf.js          # dependency-free PDF generator (Courier 12pt, standard margins)
    ├── files.js        # import/export (.fountain, .txt, .json, .pdf)
    └── app.js          # application: editor, sidebar, autocomplete, shortcuts, state
```

## Features

- **Fountain editing with live formatting** — scene headings (`INT.`, `EXT.`,
  `INT./EXT.`, `I/E`, `EST.`), action, characters (UPPERCASE with `(V.O.)`-style
  extensions), parentheticals, dialogue, transitions (`CUT TO:`, `FADE OUT.`), title-page
  metadata, notes `[[ ]]`, boneyard `/* */`, forced elements (`. @ = >`), centered text.
- **Page-bounded canvas** — simulated US Letter / A4 pages, Courier Prime 12pt (Courier
  New fallback), industry margins: 1.5" left, 1.0" top/bottom/right.
- **Transparent-textarea overlay** — you type plain Fountain; the colorized render layer
  underneath stays pixel-aligned, so formatting preview costs zero typing friction.
- **Smart keyboard workflow**
  - `Enter` — next logical element (Scene → Action, Character → Dialogue,
    Dialogue → Action, …)
  - `Shift+Enter` — plain newline
  - `Tab` — cycle the current line's element type
    (Action → Character → Dialogue → Parenthetical → Transition → Scene Heading)
  - `Shift+Tab` — insert two spaces
  - autocomplete overlay for existing **characters** and **locations** while typing
  - **scene template** — `Ctrl/Cmd+Enter` (or the sidebar *Insert* panel) drops in a blank
    `INT. LOCATION - DAY` heading, action line and character beat at the caret, with the
    location pre-selected so you can type straight over it.
- **Projects** — create, duplicate, rename, archive/restore, delete; auto-save ~0.8s
  after the last keystroke with a top-bar save indicator; active project persisted.
- **Import** — `.fountain`, `.txt`, and `.json` backups (single or multiple files).
- **Export**
  - **PDF** — hand-rolled client-side PDF generator (no libraries): US Letter or A4,
    optional title page, page numbers, Courier metrics, ~1 page per minute of runtime.
  - `.fountain` / `.txt` raw script
  - `.json` full backup archive
- **Scene outline** — collapsible sidebar index generated live from scene headings;
  click any scene to jump straight to it and place the caret there.
- **Stats** — pages, words, scenes, estimated runtime.
- **Focus mode** (`Ctrl/Cmd+E`) — hides chrome for distraction-free writing.
- **Dark / light theme** — persisted, high-contrast element colors per theme.
- **Accessible** — keyboard navigation everywhere, ARIA labels/roles, focus-visible
  rings, `prefers-reduced-motion` friendly.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Enter` | Smart next element |
| `Shift+Enter` | Plain newline |
| `Tab` | Cycle element type |
| `Shift+Tab` | Insert two spaces |
| `Ctrl/Cmd+Enter` | Insert scene template |
| `↑` / `↓` / `Enter` / `Esc` | Navigate / accept / close autocomplete |
| `Ctrl/Cmd+S` | Save now |
| `Ctrl/Cmd+P` | Export PDF |
| `Ctrl/Cmd+E` | Toggle focus mode |
| `Ctrl/Cmd+B` | Toggle sidebar |

## Formatting notes

- Scene headings begin with `INT.`, `EXT.`, `INT./EXT.`, `I/E`, etc. (case-insensitive).
- A character name is an UPPERCASE line immediately followed by dialogue; suffixes like
  `(V.O.)` and `(CONT'D)` are handled.
- Transitions are lines starting with `>` or uppercase transitions like `CUT TO:`.
- Title-page metadata sits at the very top (`Title:`, `Credit:`, `Author:`,
  `Draft date:`, `Contact:`) followed by a blank line.
- `Tab`-cycled element types are session-only and never rewrite your Fountain source;
  the PDF export always uses the canonical Fountain interpretation.

## Deploying

Point any static host at this folder. For GitHub Pages, push the project root and enable
Pages — no build step required.

## License

MIT — use it, modify it, ship it.
