import { cx } from "@hashintel/ds-helpers/css";

import {
  type InlineHighlightColor,
  type InlineHighlightVariant,
  styles,
} from "./inline-highlight.recipe";

export type {
  InlineHighlightColor,
  InlineHighlightVariant,
} from "./inline-highlight.recipe";

export type InlineHighlightProps = {
  children: React.ReactNode;
  /** Custom looks go in here (or any ancestor's class) via the override
   * properties the recipe reads: `--inline-highlight-bg`,
   * `--inline-highlight-ring-color`, `--inline-highlight-padding-inline`,
   * `--inline-highlight-padding-block`. */
  className?: string;
  color?: InlineHighlightColor;
  variant?: InlineHighlightVariant;
};

/**
 * Highlights a run of inline text with a background and a border that wraps
 * the text's rendered shape: when the run breaks across lines, the border
 * traces around the union of the line fragments rather than boxing each line
 * separately.
 */
export const InlineHighlight = ({
  children,
  className,
  color,
  variant,
}: InlineHighlightProps) => (
  <span className={cx(styles({ color, variant }), className)}>{children}</span>
);
