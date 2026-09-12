/**
 * A part of the frame that folds away and back without unmounting: a one-row
 * grid whose row goes from `1fr` to `0fr`, so the content's own height is
 * what animates, and whatever follows it moves as one block. The content is
 * clipped, turns visible at once when opening and only after the row has
 * closed when folding, and is inert and hidden from assistive technology
 * while closed — unless `keepAccessible` keeps it in the accessibility tree
 * and focusable, for a fold that opens when the keyboard reaches it. The fold
 * runs its transition under the frame's animate switch. `data-*` attributes
 * land on the clip element, with `id`, so a caller can point `aria-controls`
 * and its tests at it.
 */
import { type ReactNode, use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { FrameAnimateContext } from "./frame-animate-context";

const foldStyle = css({
  display: "grid",
  gridTemplateRows: "[0fr]",
  minWidth: "[0]",
  visibility: "hidden",
  "&[data-open=true]": {
    gridTemplateRows: "[1fr]",
    visibility: "visible",
  },
  // Clipped to nothing while closed, but still there for focus and readers.
  "&[data-keep-accessible=true]": { visibility: "visible" },
  "&[data-animate=true]": {
    transition: "[grid-template-rows 160ms ease-out, visibility 0s 160ms]",
  },
  "&[data-animate=true][data-open=true]": {
    transition: "[grid-template-rows 160ms ease-out, visibility 0s]",
  },
});

const clipStyle = css({
  minHeight: "[0]",
  minWidth: "[0]",
  overflow: "hidden",
});

export type FoldProps = {
  open: boolean;
  /** The clip element's id, for the control's `aria-controls`. */
  id?: string;
  /** Keeps the closed content in the accessibility tree and focusable, so a focus into it can open the fold. */
  keepAccessible?: boolean;
  children: ReactNode;
} & { [attribute: `data-${string}`]: true };

export const Fold = ({
  open,
  id,
  keepAccessible = false,
  children,
  ...dataAttributes
}: FoldProps) => {
  const animate = use(FrameAnimateContext);
  const reachable = open || keepAccessible;
  return (
    <div
      className={foldStyle}
      data-open={open}
      data-keep-accessible={keepAccessible}
      data-animate={animate}
    >
      <div
        {...dataAttributes}
        id={id}
        className={clipStyle}
        inert={!reachable}
        aria-hidden={reachable ? undefined : true}
      >
        {children}
      </div>
    </div>
  );
};
