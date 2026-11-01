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
   * `spaced` spaces the buttons apart; `segmented` joins them into a single
   * control with shared, overlapping borders.
   */
  variant?: "spaced" | "segmented";
  /**
   * The gap between buttons in a `spaced` group; no effect on `segmented`
   * groups, whose buttons share a border. Each value is tuned to the matching
   * Button size, so it usually equals the children's `size`.
   */
  spacing?: FormInputSize;
  /** Whether to reverse the visual and tab order of the buttons. */
  reverse?: boolean;
  /** Which edge of the available width the buttons align to. */
  alignedTo?: "left" | "right";
  /** Whether to keep the buttons on one line, overflowing instead of wrapping. */
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

// Stable name for the docs Stage code serializer under minification
ButtonGroup.displayName = "ButtonGroup";
