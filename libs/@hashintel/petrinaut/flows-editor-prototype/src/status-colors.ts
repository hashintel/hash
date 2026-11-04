/**
 * The run status colours, in one place, so the Flows palette can be swapped once Aakarsh picks one (4 Nov). Every
 * value is a DS token's CSS variable. Neutral for everything that is not a status; red only for failure, blue only for
 * running, orange only for needs review.
 */
export const statusColor = {
  done: "var(--colors-green-bg-solid)",
  failed: "var(--colors-red-s110)",
  running: "var(--colors-blue-bg-solid)",
  review: "var(--colors-orange-bg-solid)",
  /** Skipped, not reached, abandoned and the bar's empty track. */
  quiet: "var(--colors-neutral-fg-subtle)",
  track: "var(--colors-neutral-bg-solid-subtle-hover)",
  onSolid: "var(--colors-neutral-bg-solid-min)",
} as const;

/**
 * The run bar on canvas cards, neutral until the Flows palette is picked (Aakarsh, 4 Nov: "no green, red or blue on
 * the bar yet"). Darkest for a failure, a strong grey for done, a light track for what has not run. Swap these for
 * the status colours above once he picks.
 */
export const barColor = {
  done: "var(--colors-neutral-fg-muted)",
  failed: "var(--colors-neutral-fg-heading)",
  running: "var(--colors-neutral-fg-subtle)",
  review: "var(--colors-neutral-fg-heading)",
  skipped: "var(--colors-neutral-bd-solid)",
  rest: "var(--colors-neutral-bd-subtle)",
} as const;
