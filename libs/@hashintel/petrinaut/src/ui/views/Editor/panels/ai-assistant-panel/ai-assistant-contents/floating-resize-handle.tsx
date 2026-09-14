import { cva } from "@hashintel/ds-helpers/css";

import {
  RESIZE_HANDLE_OFFSET,
  RESIZE_HANDLE_SIZE,
} from "../../../../../constants/ui";

import type { ResizableEdge } from "../../../../../resize/resize-handle";
import type { ComponentProps } from "react";

const handleStyle = cva({
  base: {
    position: "absolute",
    zIndex: "sticky",
    border: "none",
    padding: "[0]",
    backgroundColor: "[transparent]",
    touchAction: "none",
    _hover: { backgroundColor: "neutral.a30" },
    _active: { backgroundColor: "blue.a40" },
  },
  variants: {
    edge: {
      top: {
        left: "[12px]",
        right: "[12px]",
        height: `[${RESIZE_HANDLE_SIZE}px]`,
        cursor: "ns-resize",
      },
      bottom: {
        left: "[12px]",
        right: "[12px]",
        height: `[${RESIZE_HANDLE_SIZE}px]`,
        cursor: "ns-resize",
      },
      left: {
        top: "[12px]",
        bottom: "[12px]",
        width: `[${RESIZE_HANDLE_SIZE}px]`,
        cursor: "ew-resize",
      },
      right: {
        top: "[12px]",
        bottom: "[12px]",
        width: `[${RESIZE_HANDLE_SIZE}px]`,
        cursor: "ew-resize",
      },
    },
  },
});

export const FloatingResizeHandle = ({
  edge,
  ...props
}: ComponentProps<"button"> & { edge: ResizableEdge }) => (
  <button
    {...props}
    type="button"
    tabIndex={-1}
    aria-label={`Resize AI assistant from ${edge}`}
    data-resize-edge={edge}
    className={handleStyle({ edge })}
    style={{ [edge]: RESIZE_HANDLE_OFFSET }}
  />
);
