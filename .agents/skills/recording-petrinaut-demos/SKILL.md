---
name: recording-petrinaut-demos
description: "Record a short screen capture of a Petrinaut flow and share it: the storyboard rules, the Playwright scenario format, the retina capture and H.264 encode, the pointer-and-keystroke overlay, and the GitHub API upload that turns the file into a link anyone on the repository can play. Use when a change needs a video or GIF of the UI, when asked for a screen recording, demo, capture or before/after pair, or when a screenshot cannot show the behaviour because it moves."
license: Apache-2.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: medium
    keywords:
      - demo
      - recording
      - screencast
      - video
      - gif
    intent-patterns:
      - "\\b(record|capture|film)\\b.*?\\b(demo|video|gif|flow|screen)\\b"
      - "\\b(demo|video|gif|screen recording)\\b.*?\\b(petrinaut|editor|ui)\\b"
      - "\\bbefore\\b.*?\\bafter\\b.*?\\b(video|recording|gif)\\b"
---

# Recording a Petrinaut demo

Every recording has the same shape, so two of them can be compared at a glance — a before against an after, or one change against another.

| Property    | Value                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Duration    | 18 s, real time, no speed-up                                           |
| Aspect      | 16:10                                                                  |
| Viewport    | 1300 × 812 CSS px                                                      |
| Capture     | 2600 × 1624 device px (`deviceScaleFactor: 2`)                         |
| Output      | MP4, H.264 High, `yuv420p`, 1600 × 1000, 30 fps, `faststart`, no audio |
| Alternative | GIF, 1600 × 1000, 20 fps, only where autoplay matters                  |
| Size        | under 10 MB, and a UI flow lands near 1.5 MB                           |

`scripts/make-demo.sh` fixes those numbers. The only creative work is the path through the app.

## Viewport and output are separate dials

The viewport decides how large the interface reads in the frame; the output decides the file's resolution. Capture is always at `deviceScaleFactor: 2`, so a viewport of half the output width means no rescale and maximum sharpness, and a larger capture downsampled to the output is the next best thing.

| Viewport | Output | Result                                                       |
| -------- | ------ | ------------------------------------------------------------ |
| 1300     | 1600   | interface 1.23× life size. The default.                      |
| 1600     | 1600   | one CSS pixel per output pixel, so the interface reads small |
| 1280     | 2560   | HiDPI file, 1:1 from the capture, interface 2×               |

Pair them explicitly: `record-demo.mjs --viewport-width 1280` with `make-demo.sh --width 2560`.

## Why this and not a screen recorder

- **A hand-driven recording cannot be repeated.** A before/after pair has to run the same path, and a scripted take does.
- **Playwright's own `recordVideo` cannot capture retina.** A `size` larger than the viewport pads the frame with grey rather than scaling, and `deviceScaleFactor` never reaches the video. `record-demo.mjs` drives a CDP `Page.startScreencast` instead and rebuilds a constant-rate video from the timestamped frames.
- **Record headless, not in an embedded browser pane.** A pane that is not on screen delivers no animation frames and no `ResizeObserver` callbacks, so transitions do not advance and anything measured from a resize observer stays frozen at its mount value. Layout read back with `getBoundingClientRect` still looks right, which makes this hard to spot.

## The five steps

1. **Start the app.** `yarn workspace @apps/petrinaut-website dev` (port 5173) is the usual target; a branch's Vercel preview works too and needs no local server. Poll until it answers 200.
2. **Write the storyboard**, as a comment at the top of the scenario file: numbered beats, each with what the viewer sees and a time budget, summing to 18 s.
3. **Write the scenario.** Copy [`references/example.scenario.mjs`](references/example.scenario.mjs) and edit its four exports.
4. **Record, encode, and read the check frames.**

   ```sh
   node .agents/skills/recording-petrinaut-demos/scripts/record-demo.mjs ./my.scenario.mjs --out ./demo
   .agents/skills/recording-petrinaut-demos/scripts/make-demo.sh ./demo/recording.json ./demo/my-flow.mp4
   ```

   Run both from the repository root: the recorder resolves Playwright and the example models through the working directory. The recorder prints the take's timeline and every console or page error — zero is the bar. The encoder writes check frames at 0, 6, 12 and 17.9 s next to the output; open all four and compare them with the storyboard's beats at those times. A take whose pacing is wrong is re-recorded, not re-encoded.

5. **Share it.** `scripts/upload-attachment.sh ./demo/my-flow.mp4` prints an asset URL that plays inline for anyone who can read the repository. See [Sharing](#sharing).

## The storyboard

Budget the 18 s in three acts:

| Act     | Share             | What it is                                                                             |
| ------- | ----------------- | -------------------------------------------------------------------------------------- |
| Context | 40–45 % (7–8 s)   | what a viewer must understand: the state before, every choice made, the primary action |
| Motion  | 35–40 % (6.5–7 s) | the behaviour being shown                                                              |
| Result  | 15–20 % (3–3.5 s) | the finished state, held still                                                         |

Beat holds, measured after the UI has changed: 0.8–1.0 s on the first frame, 1.0 s when a panel or dialog opens, 0.6–0.7 s per field or toggle, 1.0 s before the primary action, 3 s or more once the result lands. A reader needs to see an input, read it, and see the next one land, and 0.6 s is the floor for that.

Then, in priority order:

1. **Few steps.** A viewer has to follow it on the first watch. Bound the domain — six trials, not fifteen.
2. **Focus fast.** Open on the relevant view in a clean state. Loading a model, dismissing the tour and warming a runtime all happen off camera in `prepare`.
3. **Show the motion.** Keep the region that moves in frame while it moves, and let it finish on camera so the last beat is a result and not a spinner.
4. **Name what you can.** Type a descriptive name where the UI shows one; it becomes a label in the video.

**A glide takes about twice the duration you give it.** Each step of `hud.glide` is a mouse move plus a page evaluate, and the round trips dominate the 22 ms step. Halve every glide duration when translating a storyboard into code, then check the recorder's printed timeline rather than the intended one.

## The scenario

A scenario is an ES module with four exports. `references/example.scenario.mjs` is a worked one — a drag, a hover, and a panel toggle.

| Export               | Runs              | For                                                                        |
| -------------------- | ----------------- | -------------------------------------------------------------------------- |
| `url`                | —                 | path or URL to open, relative to `--base-url`                              |
| `init(page)`         | before navigation | `addInitScript` to seed `localStorage`: the model, the settings, the flags |
| `prepare(page, log)` | off camera        | dismiss the tour, reach the view, frame the canvas, warm anything slow     |
| `take(page, log)`    | on camera         | the 18 s path, one block per beat                                          |

Drive the pointer through the overlay (see [The input overlay](#the-input-overlay)) so the viewer can follow it, and `log()` the state you are asserting at each beat — the printed timeline is how you check the pacing without watching the file.

Use Playwright role locators. Two things in this app ignore synthetic clicks and need `dispatchEvent("click")`: the mode segmented control and switch-style radios. Monaco takes no synthetic keystrokes at all — drive code through seeded state instead, and say so rather than faking it.

## Petrinaut specifics

[`references/petrinaut-setup.md`](references/petrinaut-setup.md) carries the detail: the two `localStorage` keys, the settings that make up the house look, the canvas framing helper, and the traps that swallow a click aimed at a node.

The short version: seed the net under `petrinaut-sdcpn` and the settings under `petrinaut:user-settings` in `init`, always set `showWalkthroughOnInit: false`, `useEntitiesTreeView: true`, `compactNodes: true` and `leftSidebarWidth: 240`, then frame the net with `frameNet` from `scripts/petrinaut-canvas.mjs` in `prepare`. Both keys are read once at load, so a flag set after navigation does nothing.

## The input overlay

`scripts/demo-hud.mjs` draws the pointer and the keystrokes over the app; Playwright itself renders no cursor into a screencast.

```js
const hud = createDemoHud(page, { rest: { x: width - 150, y: height - 260 } });
await hud.install(); // in prepare; the pointer starts hidden
await hud.showPointer();
await hud.glideTo(button, 300);
await hud.click();
await hud.down(); // a drag: press, glide, release
await hud.glide(x, y, 700);
await hud.up();
await hud.press("Meta+k"); // key caps: the modifier, then the key
await hud.type("layout"); // no caps; the field already shows the text
await hud.hidePointer();
```

What it does and why:

- **The pointer is a mirror, not a capture.** Every gesture moves the real pointer and the mirror in one loop, so hover states track the glide instead of firing ahead of it.
- **The shape follows the app.** The overlay reads the computed `cursor` of the element under the pointer, so a resize handle turns the arrow into the system's double arrow. A `down()` holds that shape until the matching `up()`, because one pixel into a drag the element under the pointer is no longer the handle.
- **Only chords and named keys reach the caps.** Characters typed into a field are already visible in the field, and a cap per letter is noise.
- **The pointer appears and leaves.** Hide it during a keyboard-only act and after the last click, so no arrow sits over the result frame.

`scripts/probe-cursor.mjs` screenshots both cursor shapes, hovering and mid-drag, in a few seconds. Use it to judge the overlay instead of spending a whole take on it.

## Gotchas that cost real time

- **`cd` inside a command leaks into the next one.** The recorder resolves Playwright and the example models from `process.cwd()`; run it from the repository root, and pass absolute paths in one-off probes.
- **Warm heavy runtimes off camera.** A first run that downloads WASM or compiles shaders shows seconds of nothing. Run a throwaway in `prepare`, then reset the state it left behind.
- **WebGPU is off in headless Chromium.** `navigator.gpu.requestAdapter()` returns null, so a GPU path silently falls back to the CPU on camera. Export `browserArgs = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-angle=metal"]` from the scenario and probe the adapter once before recording.
- **Duplicate accessible names break strict locators.** Dialogs often carry an icon button and a footer button both named "Close"; add `{ exact: true }` and `.last()`, or a more specific role.
- **Screencast frames arrive only when pixels change**, so a static screen produces none. The harness writes each frame's on-screen duration and the encoder fills the gaps; do not reason about offsets by counting frames.
- **Growing lists push the interesting region out of frame.** Collapse them, or scroll once the layout is stable.
- **An odd output height fails the encode.** `yuv420p` subsamples by two, and ffmpeg reports it as "Could not open encoder before EOF", which reads like a codec problem.
- **Check the frame counts.** 540 frames for 18 s at 30 fps, 360 for a GIF at 20 fps, and the width you asked for. Anything else means a wrong flag.

## Before and after pairs

A pair has to run the same path against two builds, so record it in one sitting
from one scenario file:

1. **Record the after take** against the branch: build the library, start the
   dev server, record.
2. **Put the package back to main**: `git checkout origin/main -- libs/@hashintel/petrinaut/src`.
   One path, all or nothing, rather than a file list that goes stale as the
   branch grows.
3. **Rebuild and restart the dev server.** The website serves the built output,
   and a server started before the build serves the previous bundle.
4. **Record the before take.**
5. **Restore the branch**: `git checkout HEAD -- libs/@hashintel/petrinaut/src`.

**Step 5 does not fully undo step 2.** A file that main has and the branch
deleted comes back _staged_, because `git checkout HEAD -- <path>` cannot
remove what HEAD does not contain. Finish with `git status --short`, and for
anything still listed run `git rm --cached <path> && rm <path>`. Do not commit
until that status is empty.

Encode both with the same `--width`, and read the same check frames in each:
the beats should land within about 0.2 s of each other, which is what makes the
two comparable.

## Sharing

`scripts/upload-attachment.sh <file> [--repo owner/name]` posts the file to GitHub's user-attachments store and prints an asset URL. The repository decides the audience: anyone who can read it can play the video, and nobody else can.

That URL goes bare on a line of its own in the body text of a pull request, issue, or comment, where GitHub's front end turns it into a player. `<video>` markup is stripped by the sanitizer whatever the host, and only `github.com` and the `*-user-images.githubusercontent.com` hosts are allowed as media sources, so a raw or release-asset URL never plays.

**Fetching the asset URL yourself answers 404.** The redirect is signed for a browser session, so a bare `curl` proves nothing. Confirm the upload by rendering the body that carries it:

```sh
gh api repos/<owner>/<repo>/pulls/<number> -H 'Accept: application/vnd.github.html+json' --jq .body_html | grep -c '<video'
```

For Slack or anywhere outside GitHub, send the file itself: the asset URL needs a GitHub session and will not preview.
