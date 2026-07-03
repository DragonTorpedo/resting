# Resurface

A break timer for the 25/5 and 50/10 pomodoro techniques that treats the break as a short guided ritual instead of a bare countdown — settle, breathe, rest your eyes, stretch, and return — timed to fit whatever length break you chose.

**[Live demo →](#)** *(replace with your GitHub Pages URL once deployed)*

## Why

A break spent scrolling your phone for five minutes rarely feels like a break. Resurface fills the exact length of your break with a short, paced sequence built on things that actually help you unwind fast:

- **Guided breathing** — 4-7-8 breathing (a long, slow exhale) on breaks with room to spare, box breathing on tighter ones. The circle's expansion and contraction is timed exactly to each phase.
- **20-20-20 eye rest** — a moment to look at something far away and give your eyes a break from the screen.
- **Rotating stretches** — eight short stretches that cycle so you rarely get the same one twice in a row.
- **A visual "ascent"** — the background gradient rises from a dark abyssal blue to pale surface light over the course of the break, echoing the idea of coming up for air.

## Using it

Open `index.html` in a browser — no build step, no dependencies, no server required. For local development with proper module/asset behavior, any static server works too:

```bash
npx serve .
# or
python3 -m http.server
```

### Controls

| Action | How |
|---|---|
| Start / pause | Click the button, or press <kbd>Space</kbd> |
| Reset | Click Reset, or press <kbd>R</kbd> |
| Open settings | Click the gear icon, or press <kbd>S</kbd> |
| Skip a phase | Click Skip (work) or "Back to work" (break) |

### Settings

- **Technique** — 25/5, 50/10, or a custom work/break length (1–180 / 1–60 minutes).
- **Ambient sound** — a very quiet, synthesized two-tone pad during breaks (Web Audio API, no audio files).
- **Chime** — a soft tone on phase and session transitions.
- **Desktop notifications** — a system notification when a phase ends, but only if the tab isn't already focused.
- **Reduce motion** — turns off ambient animation independent of your OS-level setting.

All settings, stats, and your streak are saved to `localStorage` — nothing leaves your browser.

## Project structure

```
index.html    markup
style.css     design system + layout + animation
script.js     timer engine, break ritual builder, audio, stats
README.md     this file
```

No frameworks, no build tools, no external JS dependencies. Fonts (Fraunces, Inter, JetBrains Mono) load from Google Fonts; everything else is self-contained.

## Deploying to GitHub Pages

1. Push this folder to a repository.
2. In the repo settings, enable **Pages** → deploy from the `main` branch, root folder.
3. Your timer will be live at `https://<username>.github.io/<repo>/`.

## Customizing

- **Add a stretch** — append an object (`icon`, `title`, `body`) to `STRETCH_LIBRARY` in `script.js`.
- **Change the breathing pattern** — edit `BREATH_PATTERNS` (seconds per inhale/hold/exhale/rest).
- **Retheme the palette** — every color is a CSS custom property at the top of `style.css` under `:root`.

## License

Do whatever you'd like with this — MIT-style, no attribution required.
