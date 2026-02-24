import { css, cva } from "@hashintel/ds-helpers/css";

export const proportionalContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

/**
 * Wrapper style that controls flex distribution.
 * This is the direct child of the flex container.
 * Includes transition for smooth expand/collapse animation (disabled during resize).
 */
export const proportionalSectionWrapperStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    minHeight: "[0]",
    overflow: "hidden",
  },
  variants: {
    isExpanded: {
      true: {
        // Flex value controlled by inline style for proportional sizing
      },
      false: {
        // Collapsed: shrink to header height only
        flex: "[0 0 auto]",
      },
    },
    isResizing: {
      true: {
        // No transition during resize for immediate feedback
        transition: "[none]",
      },
      false: {
        // Animate flex changes for smooth expand/collapse
        transition: "[flex 0.2s ease-out, min-height 0.2s ease-out]",
      },
    },
  },
});

/**
 * CSS Grid wrapper for animating content expand/collapse in proportional container.
 * Uses grid-template-rows transition for smooth height animation.
 * Uses flex: 1 to fill remaining space in the section (so sash stays at bottom).
 */
export const proportionalContentAnimationWrapperStyle = cva({
  base: {
    display: "grid",
    minHeight: "[0]",
  },
  variants: {
    isExpanded: {
      true: {
        gridTemplateRows: "[1fr]",
        flex: "[1]",
      },
      false: {
        gridTemplateRows: "[0fr]",
      },
    },
    isResizing: {
      true: {
        transition: "[none]",
      },
      false: {
        transition: "[grid-template-rows 0.2s ease-out]",
      },
    },
  },
});

/**
 * Inner content container that collapses with overflow hidden.
 * Uses flex layout so children can scroll independently.
 */
export const contentInnerStyle = css({
  overflow: "hidden",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
});

export const proportionalContentStyle = css({
  overflowY: "auto",
  flex: "[1]",
  p: "2",
});

export const sashStyle = cva({
  base: {
    width: "[100%]",
    height: "[4px]",
    cursor: "ns-resize",
    backgroundColor: "[transparent]",
    border: "none",
    padding: "[0]",
    flexShrink: 0,
    transition: "[background-color 0.15s ease]",
    _hover: {
      backgroundColor: "[rgba(0, 0, 0, 0.1)]",
    },
  },
  variants: {
    isResizing: {
      true: {
        backgroundColor: "[rgba(59, 130, 246, 0.4)]",
      },
    },
  },
});

/** Minimum height for each section's content area */
export const MIN_SECTION_HEIGHT = 60;
/** Height of the header row */
export const HEADER_HEIGHT = 28;
