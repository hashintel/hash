import { useLayoutEffect, useRef } from "react";
import { Separator } from "react-resizable-panels";

import { cx } from "@hashintel/ds-helpers/css";

import { edgeSeparatorStyle } from "./edge-separator-style";

/**
 * A separator of `react-resizable-panels` on the edge of a panel: a line with
 * no thickness, a strip around it that a pointer grabs, and the strip that
 * tints on hover and turns blue while it is dragged.
 *
 * It cannot take the keyboard focus. The library gives every separator a tab
 * index and focuses the one that is pressed. Each would then be a Tab stop
 * between the panels either side, and a press would take the focus from the
 * field the user was typing in and send the next arrow key to the separator.
 * An element without a tab index is not focusable, so neither happens.
 */
export const EdgeSeparator = ({
  edge,
  label,
  paintsBorder,
  disabled,
  className,
}: {
  /** Where the panel it resizes lies: see `edgeSeparatorStyle`. */
  edge: "left" | "right" | "bottom" | "top";
  /** The separator's accessible name. */
  label: string;
  /** Whether a drag paints the panel's border, which lies under the strip. */
  paintsBorder?: boolean;
  disabled?: boolean;
  className?: string;
}) => {
  const separatorRef = useRef<HTMLDivElement>(null);
  // The library takes no `tabIndex`. It writes its own when the separator
  // mounts and each time `disabled` changes.
  useLayoutEffect(() => {
    separatorRef.current?.removeAttribute("tabindex");
  }, [disabled]);

  return (
    <Separator
      elementRef={separatorRef}
      aria-label={label}
      disabled={disabled}
      disableDoubleClick
      className={cx(edgeSeparatorStyle({ edge, paintsBorder }), className)}
    />
  );
};
