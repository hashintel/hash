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
    backgroundColor: "[currentColor]",
    color: "[transparent]",
    overflow: "visible",
    touchAction: "none",
    _hover: { color: "neutral.a30" },
    _active: { color: "blue.a40" },
  },
  variants: {
    corner: {
      true: {
        backgroundColor: "[transparent]",
        _before: {
          content: '""',
          position: "absolute",
          pointerEvents: "none",
          boxSizing: "border-box",
          width: "[calc(15px + 49px)]",
          height: "[calc(15px + 49px)]",
          borderStyle: "solid",
          borderColor: "[currentColor]",
          borderWidth: "[5px 0 0 5px]",
          borderRadius: "[15px 0 0 0]",
          maskImage:
            "[linear-gradient(to right, #000 15px, transparent calc(15px + 49px)), linear-gradient(to bottom, #000 15px, transparent calc(15px + 49px))]",
          maskComposite: "intersect",
        },
      },
    },
    direction: {
      top: {
        left: "[12px]",
        right: "[12px]",
        height: `[${RESIZE_HANDLE_SIZE}px]`,
        cursor: "ns-resize",
        maskImage:
          "[linear-gradient(to right, transparent, #000 49px, #000 calc(100% - 49px), transparent)]",
      },
      bottom: {
        left: "[12px]",
        right: "[12px]",
        height: `[${RESIZE_HANDLE_SIZE}px]`,
        cursor: "ns-resize",
        maskImage:
          "[linear-gradient(to right, transparent, #000 49px, #000 calc(100% - 49px), transparent)]",
      },
      left: {
        top: "[12px]",
        bottom: "[12px]",
        width: `[${RESIZE_HANDLE_SIZE}px]`,
        cursor: "ew-resize",
        maskImage:
          "[linear-gradient(to bottom, transparent, #000 49px, #000 calc(100% - 49px), transparent)]",
      },
      right: {
        top: "[12px]",
        bottom: "[12px]",
        width: `[${RESIZE_HANDLE_SIZE}px]`,
        cursor: "ew-resize",
        maskImage:
          "[linear-gradient(to bottom, transparent, #000 49px, #000 calc(100% - 49px), transparent)]",
      },
      "top-left": {
        width: "[15px]",
        height: "[15px]",
        borderTopLeftRadius: "[15px]",
        cursor: "nwse-resize",
        _before: { top: "[0]", left: "[0]" },
      },
      "top-right": {
        width: "[15px]",
        height: "[15px]",
        borderTopRightRadius: "[15px]",
        cursor: "nesw-resize",
        _before: {
          top: "[0]",
          right: "[0]",
          transform: "[rotate(90deg)]",
        },
      },
      "bottom-left": {
        width: "[15px]",
        height: "[15px]",
        borderBottomLeftRadius: "[15px]",
        cursor: "nesw-resize",
        _before: {
          bottom: "[0]",
          left: "[0]",
          transform: "[rotate(270deg)]",
        },
      },
      "bottom-right": {
        width: "[15px]",
        height: "[15px]",
        borderBottomRightRadius: "[15px]",
        cursor: "nwse-resize",
        _before: {
          bottom: "[0]",
          right: "[0]",
          transform: "[rotate(180deg)]",
        },
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
    className={handleStyle({ direction, corner: direction.includes("-") })}
    style={{
      top: direction.includes("top") ? RESIZE_HANDLE_OFFSET : undefined,
      right: direction.includes("right") ? RESIZE_HANDLE_OFFSET : undefined,
      bottom: direction.includes("bottom") ? RESIZE_HANDLE_OFFSET : undefined,
      left: direction.includes("left") ? RESIZE_HANDLE_OFFSET : undefined,
    }}
  />
);
