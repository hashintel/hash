import { cva } from "@hashintel/ds-helpers/css";

const resizeHandleStyle = cva({
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
    position: {
      top: {},
      bottom: {},
    },
  },
});

interface ResizeHandleProps {
  position: "top" | "bottom";
  isResizing: boolean;
  onMouseDown: (event: React.MouseEvent) => void;
}

/**
 * Reusable resize handle button component.
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  position,
  isResizing,
  onMouseDown,
}) => (
  <button
    type="button"
    aria-label="Resize section"
    onMouseDown={onMouseDown}
    className={resizeHandleStyle({ isResizing, position })}
  />
);
