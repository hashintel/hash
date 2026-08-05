"use client";

import { Children, useRef } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./button-group.recipe";
import { useSegmentedRows } from "./use-segmented-rows";

export type ButtonGroupProps = {
  className?: string;
  children?: React.ReactNode;
  /**
   * `spaced` (default) spaces the buttons apart; `segmented` joins them into
   * a single control with shared, overlapping borders.
   */
  variant?: "spaced" | "segmented";
  /** Reverse the visual (and focus/tab) order of the buttons. */
  reverse?: boolean;
  /** Which edge of the available width the buttons align to. Defaults to `left`. */
  alignedTo?: "left" | "right";
};

export const ButtonGroup = ({
  className,
  children,
  variant = "spaced",
  reverse = false,
  alignedTo = "left",
}: ButtonGroupProps) => {
  // Reversing the DOM (rather than using `flex-direction: row-reverse`) keeps
  // focus/tab order matching the visual order and leaves `alignedTo` mapping to
  // physical left/right regardless of `reverse`.
  const content = reverse ? Children.toArray(children).reverse() : children;

  // In a wrapped `segmented` group, `:first-child`/`:last-child` only round the
  // very first/last button; this re-applies the outer radii per visual row.
  const ref = useRef<HTMLDivElement>(null);
  useSegmentedRows(ref, variant === "segmented");

  return (
    <div
      ref={ref}
      role="group"
      className={cx(styles({ variant, alignedTo }), className)}
    >
      {content}
    </div>
  );
};
