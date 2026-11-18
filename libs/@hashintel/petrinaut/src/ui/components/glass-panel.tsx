import { type CSSProperties, type ReactNode, type Ref } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { ResizeHandle, type ResizableEdge } from "../resize/resize-handle";

const panelContainerStyle = css({
  position: "relative",
  backgroundColor: "neutral.s00",
  borderColor: "neutral.s40",
  boxSizing: "content-box",
  borderStyle: "solid",
  // The dragged edge highlights while its handle reports an active resize.
  '&:has([data-resize-edge="top"][data-resizing="true"])': {
    borderTopColor: "blue.a70",
  },
  '&:has([data-resize-edge="bottom"][data-resizing="true"])': {
    borderBottomColor: "blue.a70",
  },
  '&:has([data-resize-edge="left"][data-resizing="true"])': {
    borderLeftColor: "blue.a70",
  },
  '&:has([data-resize-edge="right"][data-resizing="true"])': {
    borderRightColor: "blue.a70",
  },
});

const contentContainerStyle = css({
  position: "relative",
  height: "[100%]",
  width: "[100%]",
});

interface ResizeConfig {
  /** Which edge of the panel is resizable */
  edge: ResizableEdge;
  /** Called on every pointer move of a drag, with the new size */
  onResize: (newSize: number) => void;
  /** Called once when a drag ends */
  onResizeEnd?: () => void;
  /** The size when a drag starts (width for left/right, height for top/bottom) */
  getSize: () => number;
  /** Minimum size constraint */
  minSize?: number;
  /** Maximum size constraint */
  maxSize?: number;
}

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
  /** Inline styles for the content container */
  contentStyle?: CSSProperties;
  /** Configuration for making the panel resizable */
  resizable?: ResizeConfig;
}

/**
 * GlassPanel provides a styled container panel.
 *
 * Optionally supports resizing from any edge with the `resizable` prop.
 */
export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className,
  style,
  ref,
  contentClassName,
  contentStyle,
  resizable,
}) => (
  <div className={cx(panelContainerStyle, className)} style={style} ref={ref}>
    {resizable && (
      <ResizeHandle
        edge={resizable.edge}
        getSize={resizable.getSize}
        onResize={resizable.onResize}
        onResizeEnd={resizable.onResizeEnd}
        minSize={resizable.minSize ?? 100}
        maxSize={resizable.maxSize ?? 800}
        label={`Resize panel from ${resizable.edge}`}
      />
    )}

    <div
      className={cx(contentContainerStyle, contentClassName)}
      style={contentStyle}
    >
      {children}
    </div>
  </div>
);
