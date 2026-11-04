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
