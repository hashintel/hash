"use client";

import { Children, useRef } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./button-group.recipe";
import { useSegmentedRows } from "./use-segmented-rows";

import type { FormInputSize } from "../../util/form-shared";

export type ButtonGroupProps = {
  className?: string;
  children?: React.ReactNode;
  /**
   * `spaced` (default) spaces the buttons apart; `segmented` joins them into
   * a single control with shared, overlapping borders.
   */
  variant?: "spaced" | "segmented";
  /**
   * The gap between buttons in a `spaced` group, on the shared FormInputSize
   * scale. Has no effect on `segmented` groups, whose buttons share a border.
   * Aligned + fitted to Button sizes with the same value, so usually should
   * match the button size of the children.
   */
  spacing?: FormInputSize;
  /** Reverse the visual (and focus/tab) order of the buttons. */
  reverse?: boolean;
  /** Which edge of the available width the buttons align to. Defaults to `left`. */
  alignedTo?: "left" | "right";
  /** Keep the buttons on a single line (overflowing) instead of wrapping. */
  noWrap?: boolean;
};

export const ButtonGroup = ({
  className,
  children,
  variant = "spaced",
  spacing = "md",
  reverse = false,
  alignedTo = "left",
  noWrap = false,
}: ButtonGroupProps) => {
  // Reversing the DOM  keeps focus/tab order matching
  const content = reverse ? Children.toArray(children).reverse() : children;

  // In a `segmented` group that wraps onto multiple lines,
  // we apply the outer radii per visual row with `data-row-start`/`data-row-end`.
  const ref = useRef<HTMLDivElement>(null);
  const decoratedContent = useSegmentedRows(ref, content, variant, noWrap);

  return (
    <div
      ref={ref}
      role="group"
      className={cx(styles({ variant, spacing, alignedTo, noWrap }), className)}
    >
      {decoratedContent}
    </div>
  );
};
