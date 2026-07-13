import { useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../Button/button";
import { Popover, type PopoverProps } from "./popover";

import type { Story, StoryDefault } from "@ladle/react";

type Point = NonNullable<PopoverProps["positionFromPoint"]>;

const popoverContent = css({
  backgroundColor: "white",
  color: "fg.body",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.15)]",
  borderRadius: "md",
  paddingX: "2",
  paddingY: "1",
  textStyle: "xs",
  whiteSpace: "nowrap",
});

/**
 * A trigger button that toggles its own popover open/closed on click. Because
 * `Popover` is only rendered while open, the button owns the open state and the
 * ref the popover positions against.
 */
const PopoverToggle = ({
  label,
  position,
  /** When set, the popover positions from a point relative to the trigger's top-left, measured from the rendered trigger when it opens. */
  getPoint,
}: {
  label: string;
  position?: PopoverProps["position"];
  getPoint?: (rect: DOMRect) => Point;
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<Point>();

  const toggle = () => {
    if (!open && getPoint && triggerRef.current) {
      setPoint(getPoint(triggerRef.current.getBoundingClientRect()));
    }
    setOpen((wasOpen) => !wasOpen);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        size="xxs"
        variant={open ? "solid" : "subtle"}
        className={css({ width: "[100%]" })}
        onClick={toggle}
      >
        {label}
      </Button>
      {open ? (
        <Popover
          triggerRef={triggerRef}
          position={position}
          positionFromPoint={getPoint ? point : undefined}
        >
          <div className={popoverContent}>{label}</div>
        </Popover>
      ) : null}
    </>
  );
};

type Cell =
  | { kind: "position"; position: NonNullable<PopoverProps["position"]> }
  | {
      kind: "point";
      label: string;
      position: NonNullable<PopoverProps["position"]>;
      getPoint: (rect: DOMRect) => Point;
    }
  | { kind: "empty" };

// Mirrors the Tooltip `AllPositions` grid: the twelve directional placements
// laid out around the edges. The centre column - unused by the directional
// demos - holds the two `positionFromPoint` demos.
const gridCells: Cell[] = [
  { kind: "position", position: "top-start" },
  { kind: "position", position: "top" },
  { kind: "position", position: "top-end" },
  { kind: "position", position: "left-start" },
  // Internal point: anchored to the centre of the trigger.
  {
    kind: "point",
    label: "point: center",
    position: "bottom",
    getPoint: (rect) => ({ x: rect.width / 2, y: rect.height / 2 }),
  },
  { kind: "position", position: "right-start" },
  { kind: "position", position: "left" },
  { kind: "empty" },
  { kind: "position", position: "right" },
  { kind: "position", position: "left-end" },
  // External point: anchored 24px beyond the trigger's right edge.
  {
    kind: "point",
    label: "point: outside",
    position: "right",
    getPoint: (rect) => ({ x: rect.width + 24, y: rect.height / 2 }),
  },
  { kind: "position", position: "right-end" },
  { kind: "position", position: "bottom-start" },
  { kind: "position", position: "bottom" },
  { kind: "position", position: "bottom-end" },
];

export const Positions: Story = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 12,
      padding: 80,
      maxWidth: 500,
      margin: "0 auto",
    }}
  >
    {gridCells.map((cell, index) => {
      if (cell.kind === "empty") {
        // eslint-disable-next-line react/no-array-index-key
        return <div key={`empty-${index}`} />;
      }

      if (cell.kind === "point") {
        return (
          <PopoverToggle
            key={cell.label}
            label={cell.label}
            position={cell.position}
            getPoint={cell.getPoint}
          />
        );
      }

      return (
        <PopoverToggle
          key={cell.position}
          label={cell.position}
          position={cell.position}
        />
      );
    })}
  </div>
);

export default {
  title: "Components/Popover",
} satisfies StoryDefault;
