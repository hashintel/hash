---
"@hashintel/ds-icons": patch
---

Add a prototype `@hashintel/ds-icons/svg` entry with `play`, `playback` and `loading` as single SVGs. Each icon has one source that renders as an SVG string (`svgIconToString`) and as a React component (`SvgIcon`). All motion runs in CSS, driven by `--ds-icon-progress`, `data-run` and `data-active`; size and weight come from `--ds-icon-size` and `--ds-icon-weight`.
