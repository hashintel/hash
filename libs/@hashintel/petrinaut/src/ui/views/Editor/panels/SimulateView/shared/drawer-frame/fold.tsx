/**
 * A part of the frame that folds away and back without unmounting: a one-row
 * grid whose row goes from `1fr` to `0fr`, so the content's own height is
 * what animates, and whatever follows it moves as one block. The content is
 * clipped, turns visible at once when opening and only after the row has
 * closed when folding, and is inert and hidden from assistive technology
 * while closed. The fold runs its transition under the frame's animate
 * switch. `data-*` attributes land on the clip element, with `id`, so a
 * caller can point `aria-controls` and its tests at it.
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
  children: ReactNode;
} & { [attribute: `data-${string}`]: true };

export const Fold = ({ open, id, children, ...dataAttributes }: FoldProps) => {
  const animate = use(FrameAnimateContext);
  return (
    <div className={foldStyle} data-open={open} data-animate={animate}>
      <div
        {...dataAttributes}
        id={id}
        className={clipStyle}
        inert={!open}
        aria-hidden={open ? undefined : true}
      >
        {children}
      </div>
    </div>
  );
};
