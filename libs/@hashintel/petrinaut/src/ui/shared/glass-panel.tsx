import { css, cx } from "@hashintel/ds-helpers/css";

import type { CSSProperties, ReactNode, Ref } from "react";

const panelStyle = css({
  position: "relative",
  backgroundColor: "neutral.s00",
  borderColor: "neutral.s40",
  borderStyle: "solid",
  // The border lies outside the size the panel is given. The strip of the
  // separator that resizes a docked panel is centred on it.
  boxSizing: "content-box",
});

const contentStyle = css({
  position: "relative",
  height: "[100%]",
  width: "[100%]",
});

/**
 * The box of a panel beside the canvas: its background and the colour of its
 * border. The caller says which edges have a border, and how wide.
 */
export const GlassPanel = ({
  children,
  className,
  style,
  ref,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  /** For the element that holds the children, which fills the panel. */
  contentClassName?: string;
}) => (
  <div className={cx(panelStyle, className)} style={style} ref={ref}>
    <div className={cx(contentStyle, contentClassName)}>{children}</div>
  </div>
);
