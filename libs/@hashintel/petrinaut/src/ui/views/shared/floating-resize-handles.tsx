import { cva } from "@hashintel/ds-helpers/css";

import type { ComponentProps } from "react";

export type ResizableEdge = "top" | "bottom" | "left" | "right";

export type FloatingResizeDirection =
  | ResizableEdge
  | `${"top" | "bottom"}-${"left" | "right"}`;

/**
 * How thick the strip along an edge is, in pixels. A constant of this file:
 * Panda does not extract a style value built from a constant of another
 * module, and the strip would have no thickness.
 */
const handleSize = 5;
/** Where a handle starts from its edge of the window: the strip straddles the edge. */
const handleOffset = -Math.floor(handleSize / 2) - 1;

/** The strip along the top or the bottom edge, which fades out towards the corners. */
const horizontalEdge = {
  left: "[12px]",
  right: "[12px]",
  height: `[${handleSize}px]`,
  cursor: "ns-resize",
  maskImage:
    "[linear-gradient(to right, transparent, #000 49px, #000 calc(100% - 49px), transparent)]",
} as const;

/** The strip along the left or the right edge. */
const verticalEdge = {
  top: "[12px]",
  bottom: "[12px]",
  width: `[${handleSize}px]`,
  cursor: "ew-resize",
  maskImage:
    "[linear-gradient(to bottom, transparent, #000 49px, #000 calc(100% - 49px), transparent)]",
} as const;

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
    _focusVisible: { color: "blue.a40", outline: "none" },
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
      top: { ...horizontalEdge },
      bottom: { ...horizontalEdge },
      left: { ...verticalEdge },
      right: { ...verticalEdge },
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

const FloatingResizeHandle = ({
  direction,
  label,
  tabIndex = -1,
  ...props
}: ComponentProps<"button"> & {
  direction: FloatingResizeDirection;
  label: string;
}) => (
  <button
    {...props}
    type="button"
    tabIndex={tabIndex}
    aria-label={`Resize ${label} from ${direction}`}
    data-resize-edge={direction}
    className={handleStyle({ direction, corner: direction.includes("-") })}
    style={{
      top: direction.includes("top") ? handleOffset : undefined,
      right: direction.includes("right") ? handleOffset : undefined,
      bottom: direction.includes("bottom") ? handleOffset : undefined,
      left: direction.includes("left") ? handleOffset : undefined,
    }}
  />
);

export const FloatingResizeHandles = ({
  label,
  getHandleProps,
}: {
  label: string;
  getHandleProps: (
    direction: FloatingResizeDirection,
  ) => ComponentProps<"button">;
}) => (
  <>
    {(
      [
        "top",
        "right",
        "bottom",
        "left",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ] as const
    ).map((direction) => (
      <FloatingResizeHandle
        key={direction}
        direction={direction}
        label={label}
        {...getHandleProps(direction)}
      />
    ))}
  </>
);
