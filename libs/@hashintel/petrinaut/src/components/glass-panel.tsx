import { css, cx } from "@hashintel/ds-helpers/css";
import type { CSSProperties, ReactNode } from "react";

const panelContainerStyle = css({
  position: "relative",
  borderRadius: "[12px]",
  backgroundColor: "[rgba(255, 255, 255, 0.7)]",
  boxShadow: "[0 3px 13px rgba(0, 0, 0, 0.1)]",
  border: "[1px solid rgba(255, 255, 255, 0.8)]",
  overflow: "hidden",
});

const blurOverlayStyle = css({
  position: "absolute",
  inset: "[0]",
  borderRadius: "[12px]",
  pointerEvents: "none",
  backdropFilter: "[blur(24px)]",
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
  /** Additional CSS class name for the content container */
  contentClassName?: string;
  /** Inline styles for the content container */
  contentStyle?: CSSProperties;
  /** Blur amount in pixels (default: 24) */
  blur?: number;
}

/**
 * GlassPanel provides a frosted glass-like appearance with backdrop blur.
 *
 * Uses a separate overlay element for the backdrop-filter to avoid
 * interfering with child components that use fixed/absolute positioning
 * (e.g., Monaco Editor hover widgets).
 */
export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className,
  style,
  contentClassName,
  contentStyle,
  blur = 24,
}) => {
  return (
    <div className={cx(panelContainerStyle, className)} style={style}>
      {/* Blur overlay - separate from content to avoid affecting child positioning */}
      <div
        className={blurOverlayStyle}
        style={blur !== 24 ? { backdropFilter: `blur(${blur}px)` } : undefined}
      />

      {/* Content container */}
      <div
        className={cx(contentContainerStyle, contentClassName)}
        style={contentStyle}
      >
        {children}
      </div>
    </div>
  );
};
