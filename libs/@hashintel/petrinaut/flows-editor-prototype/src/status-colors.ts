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
 * The run bar on canvas cards: "super subtle, like a faint idea" (Aakarsh, 4 Nov). Neutral alpha steps only: done
 * is faint, failure and needs review one step darker so they can still be found, running pulses on the faint step,
 * and the not-reached track is fainter still. Swap for the status colours above once the palette is picked.
 */
export const barColor = {
  done: "var(--colors-neutral-a25)",
  failed: "var(--colors-neutral-a45)",
  running: "var(--colors-neutral-a25)",
  review: "var(--colors-neutral-a45)",
  skipped: "var(--colors-neutral-a15)",
  rest: "var(--colors-neutral-a10)",
} as const;
