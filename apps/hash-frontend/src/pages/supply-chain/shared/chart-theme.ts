import { token } from "@hashintel/ds-helpers/tokens";

/**
 * Central chart color theme. Every value is read from a ds-components token
 * via `token.var(...)` (→ `var(--colors-…)`), so charts follow the design system
 * and theme with it — no literal hex in chart components.
 *
 * Roles map to the supply-chain chart palette:
 *   axis/grid/ticks -> neutral `fg`/`bd`; series -> `status.*` + a yellow mean line.
 *
 * Scope: the `--colors-*` vars are defined inside `.hash-ds-root`, so charts
 * must render inside the supply-chain layout or a portal container within it.
 */
export const chartTheme = {
  /** Axis lines, gridlines, and tick labels. */
  axis: {
    /** `axisLine`/tick line stroke (was `#dfdfdf`). */
    line: token.var("colors.bd.subtle"),
    /** Standard tick label (was `#646464`). */
    tick: token.var("colors.fg.muted"),
    /** Emphasised tick label (was `#000`). */
    tickStrong: token.var("colors.fg.heading"),
  },
  /** Cartesian gridlines (was `#dfdfdf` / faint). */
  grid: token.var("colors.bd.subtle"),
  /** Dashed reference/assumption line (was `#989898`). */
  reference: token.var("colors.fg.subtle"),
  /** Recharts tooltip surface (opaque — may render in a portal). */
  tooltip: {
    bg: token.var("colors.bgSolid.min"),
    border: token.var("colors.bd.subtle"),
    text: token.var("colors.fg.body"),
  },
  /** Data series, by semantic role. */
  series: {
    /** "Under assumption" / median / info (was `#64ade6`). */
    info: token.var("colors.status.info.bg.solid"),
    /** Mean line (was `#ffce5c`). */
    mean: token.var("colors.yellow.s90"),
    /** "Above assumption" / over (was `#ff9c5e`). */
    warning: token.var("colors.status.warning.bg.solid"),
    /** Worst band (was `#ff8870`). */
    critical: token.var("colors.status.error.bg.solid"),
    /** Positive/"reduced" series (was teal `#3cc3b3`). */
    success: token.var("colors.status.success.bg.solid"),
    /** Neutral/secondary series. */
    neutral: token.var("colors.fg.subtle"),
  },
} as const;

export type ChartTheme = typeof chartTheme;
