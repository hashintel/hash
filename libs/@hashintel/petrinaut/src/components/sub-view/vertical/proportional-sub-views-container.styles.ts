import { css } from "@hashintel/ds-helpers/css";

export const proportionalContainerStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  /**
   * Animate programmatic collapse/expand via CSS transition on flex-grow.
   * Disabled when a separator is actively being dragged (data-separator="active")
   * so drag-to-resize stays snappy.
   */
  "& [data-panel]": {
    transition: "[flex-grow 200ms ease-out]",
  },
  "&:has([data-separator=active]) [data-panel]": {
    transition: "[none]",
  },
});

export const sectionWrapperStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  overflow: "hidden",
});

export const sectionContentStyle = css({
  overflow: "hidden",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
});

export const panelContentStyle = css({
  overflowY: "auto",
  flex: "[1]",
  p: "2",
});

export const resizeHandleStyle = css({
  height: "[4px]",
  cursor: "ns-resize",
  backgroundColor: "[transparent]",
  transition: "[background-color 0.15s ease]",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.1)]",
  },
  _active: {
    backgroundColor: "[rgba(59, 130, 246, 0.4)]",
  },
});

/** Height of the header row */
export const HEADER_HEIGHT = 28;
/** Default minimum panel height (header + content) when no per-subview minHeight is set */
export const DEFAULT_MIN_PANEL_HEIGHT = 100;
