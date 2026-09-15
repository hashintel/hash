import { cva } from "@hashintel/ds-helpers/css";

import {
  RESIZE_HANDLE_OFFSET,
  RESIZE_HANDLE_SIZE,
} from "../../../../../constants/ui";

import type { FloatingResizeDirection } from "./use-floating-position/resize-floating-panel";
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
    direction: {
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
      "top-left": {
        width: "[15px]",
        height: "[15px]",
        borderTopLeftRadius: "[15px]",
        cursor: "nwse-resize",
      },
      "top-right": {
        width: "[15px]",
        height: "[15px]",
        borderTopRightRadius: "[15px]",
        cursor: "nesw-resize",
      },
      "bottom-left": {
        width: "[15px]",
        height: "[15px]",
        borderBottomLeftRadius: "[15px]",
        cursor: "nesw-resize",
      },
      "bottom-right": {
        width: "[15px]",
        height: "[15px]",
        borderBottomRightRadius: "[15px]",
        cursor: "nwse-resize",
      },
    },
  },
});

export const FloatingResizeHandle = ({
  direction,
  ...props
}: ComponentProps<"button"> & { direction: FloatingResizeDirection }) => (
  <button
    {...props}
    type="button"
    tabIndex={-1}
    aria-label={`Resize AI assistant from ${direction}`}
    data-resize-edge={direction}
    className={handleStyle({ direction })}
    style={{
      top: direction.includes("top") ? RESIZE_HANDLE_OFFSET : undefined,
      right: direction.includes("right") ? RESIZE_HANDLE_OFFSET : undefined,
      bottom: direction.includes("bottom") ? RESIZE_HANDLE_OFFSET : undefined,
      left: direction.includes("left") ? RESIZE_HANDLE_OFFSET : undefined,
    }}
  />
);
