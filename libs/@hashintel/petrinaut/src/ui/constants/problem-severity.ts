import { css } from "@hashintel/ds-helpers/css";

/**
 * The text colour of a problem, read off the element's `data-severity`. An
 * attribute selector, so it wins over a colour the element's own class sets.
 */
export const problemTextStyle = css({
  "&[data-severity=error]": { color: "red.s100" },
  "&[data-severity=warning]": { color: "orange.s110" },
  "&[data-severity=info]": { color: "neutral.s95" },
});

/** The same colours for a stroke drawn in SVG, where a class cannot reach. */
export const problemColor = {
  error: "var(--colors-red-s100)",
  warning: "var(--colors-orange-s110)",
} as const;
