import { cva } from "@hashintel/ds-helpers/css";

import type { ResizeDirection } from "./use-resize-drag";

const resizeHandleStyle = cva({
  base: {
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
    direction: {
      vertical: {
        width: "[100%]",
        height: "[4px]",
        cursor: "ns-resize",
      },
      horizontal: {
        height: "[100%]",
        width: "[4px]",
        cursor: "ew-resize",
      },
    },
  },
});

interface ResizeHandleProps {
  direction: ResizeDirection;
  isResizing: boolean;
  onMouseDown: (event: React.MouseEvent) => void;
}

/**
 * Reusable resize handle button.
 *
 * Renders as a thin strip (4 px) that highlights on hover and while
 * actively resizing.
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  isResizing,
  onMouseDown,
}) => (
  <button
    type="button"
    aria-label="Resize section"
    onMouseDown={onMouseDown}
    className={resizeHandleStyle({ isResizing, direction })}
  />
);
