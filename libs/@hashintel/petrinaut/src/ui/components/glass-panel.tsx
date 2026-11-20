import { css, cx } from "@hashintel/ds-helpers/css";

import type { CSSProperties, ReactNode, Ref } from "react";

const panelContainerStyle = css({
  position: "relative",
  backgroundColor: "neutral.s00",
  borderColor: "neutral.s40",
  boxSizing: "content-box",
  borderStyle: "solid",
});

const contentContainerStyle = css({
  position: "relative",
  height: "[100%]",
  width: "[100%]",
});

interface GlassPanelProps {
  /** Content to render inside the panel */
  children: ReactNode;
  /** Additional CSS class name for the panel container */
  className?: string;
  /** Inline styles for the panel container */
  style?: CSSProperties;
  /** The panel container element */
  ref?: Ref<HTMLDivElement>;
  /** Additional CSS class name for the content container */
  contentClassName?: string;
}

/** A styled container for a panel over the canvas. */
export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className,
  style,
  ref,
  contentClassName,
}) => (
  <div className={cx(panelContainerStyle, className)} style={style} ref={ref}>
    <div className={cx(contentContainerStyle, contentClassName)}>
      {children}
    </div>
  </div>
);
