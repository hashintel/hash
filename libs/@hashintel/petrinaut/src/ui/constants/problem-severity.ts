import { css } from "@hashintel/ds-helpers/css";

import type { ProblemSeverity } from "@hashintel/petrinaut-core";

/**
 * The text colour of a problem, read off the element's `data-severity`. An
 * attribute selector, so it wins over a colour the element's own class sets.
 */
export const problemTextStyle = css({
  "&[data-severity=error]": { color: "red.s100" },
  "&[data-severity=warning]": { color: "orange.s110" },
  "&[data-severity=info]": { color: "neutral.s95" },
});

/**
 * The same colours for a stroke drawn in SVG, where a class cannot reach.
 * `undefined` for a note or no problem: neither recolours a stroke.
 */
export const problemStrokeColor = (
  severity: ProblemSeverity | null | undefined,
): string | undefined =>
  severity === "error"
    ? "var(--colors-red-s100)"
    : severity === "warning"
      ? "var(--colors-orange-s110)"
      : undefined;
