import { defineSvgIcon, svgIconHoverSelector } from "./define-icon";

const easeOut = "cubic-bezier(0.2, 0, 0.2, 1)";

/** Action icon. Nudges right on hover, and once per one-shot trigger. */
export const play = defineSvgIcon({
  name: "play",
  nodes: [["path", { d: "M7 4.5 20 12 7 19.5Z", "data-fill": "" }]],
  css: `
.ds-icon-play path {
  transition: transform 160ms ${easeOut};
}
${svgIconHoverSelector} .ds-icon-play path {
  transform: translateX(1px);
}
@keyframes ds-icon-play-nudge-odd {
  35% { transform: translateX(2px); }
}
@keyframes ds-icon-play-nudge-even {
  35% { transform: translateX(2px); }
}
.ds-icon-play[data-run="odd"] path {
  animation: ds-icon-play-nudge-odd var(--ds-icon-duration, 420ms) cubic-bezier(0.2, 0.7, 0.25, 1);
}
.ds-icon-play[data-run="even"] path {
  animation: ds-icon-play-nudge-even var(--ds-icon-duration, 420ms) cubic-bezier(0.2, 0.7, 0.25, 1);
}
`,
});

/** State icon. Progress 0 shows play, 1 shows pause. */
export const playback = defineSvgIcon({
  name: "playback",
  nodes: [
    ["path", { d: "M7 4.5 20 12 7 19.5Z", "data-part": "play" }],
    [
      "g",
      { "data-part": "pause" },
      [
        ["rect", { x: 5.5, y: 4, width: 4, height: 16, rx: 1 }],
        ["rect", { x: 14.5, y: 4, width: 4, height: 16, rx: 1 }],
      ],
    ],
  ],
  css: `
.ds-icon-playback {
  fill: currentColor;
}
.ds-icon-playback [data-part] {
  transition:
    opacity var(--ds-icon-duration, 300ms) ${easeOut},
    transform var(--ds-icon-duration, 300ms) ${easeOut};
}
.ds-icon-playback [data-part="play"] {
  opacity: calc(1 - var(--ds-icon-progress, 0));
  transform: scale(calc(1 - 0.15 * var(--ds-icon-progress, 0)));
}
.ds-icon-playback [data-part="pause"] {
  opacity: var(--ds-icon-progress, 0);
  transform: scale(calc(0.85 + 0.15 * var(--ds-icon-progress, 0)));
}
`,
});

/**
 * Spins while `data-active` is set. With a progress value, the arc shows how
 * much is done, starting from the top.
 */
export const loading = defineSvgIcon({
  name: "loading",
  nodes: [
    ["circle", { cx: 12, cy: 12, r: 8, opacity: 0.2 }],
    ["circle", { cx: 12, cy: 12, r: 8, pathLength: 1, "data-part": "arc" }],
  ],
  css: `
.ds-icon-loading [data-part="arc"] {
  stroke-dasharray: var(--ds-icon-progress, 0.25) 1;
  transform: rotate(-90deg);
  transition: stroke-dasharray 200ms ${easeOut};
}
@keyframes ds-icon-loading-spin {
  to { transform: rotate(270deg); }
}
.ds-icon-loading[data-active] [data-part="arc"] {
  animation: ds-icon-loading-spin var(--ds-icon-duration, 1100ms) linear infinite;
}
`,
});

export const svgIcons = { play, playback, loading } as const;

export type SvgIconName = keyof typeof svgIcons;
