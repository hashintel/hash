import { useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../Button/button";
import { Tooltip } from "../Tooltip/tooltip";
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

const customContent = css({
  backgroundColor: "white",
  color: "fg.body",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.15)]",
  borderRadius: "lg",
  padding: "3",
  maxWidth: "[240px]",
  textStyle: "sm",
});

const panelWidth = css({ width: "[260px]" });

/**
 * A trigger button that toggles its own popover open/closed on click, exposing
 * a `close` callback to the rendered content. Because `Popover` is only
 * rendered while open, the button owns the open state and the ref the popover
 * positions against.
 */
const PopoverExample = ({
  label,
  position = "bottom-start",
  closeOnInteractOutside,
  children,
}: {
  label: string;
  position?: PopoverProps["position"];
  closeOnInteractOutside?: PopoverProps["closeOnInteractOutside"];
  children: (close: () => void) => PopoverProps["children"];
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button
        ref={triggerRef}
        variant={open ? "solid" : "subtle"}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {label}
      </Button>
      {open ? (
        <Popover
          triggerRef={triggerRef}
          position={position}
          closeOnInteractOutside={closeOnInteractOutside}
          onClose={close}
        >
          {children(close)}
        </Popover>
      ) : null}
    </>
  );
};

/**
 * The popover compositions: fully custom content (positioning only), the
 * individual panels on their own, and a kitchen sink combining a wrapping
 * title, multiple bodies, and multiple footers.
 */
export const Default: Story = () => (
  <div
    style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 12,
      padding: 10,
      alignItems: "flex-start",
    }}
  >
    <PopoverExample label="Custom">
      {() => (
        <div className={customContent}>
          Fully custom content — no panels, just positioning.
        </div>
      )}
    </PopoverExample>

    <PopoverExample label="Title only">
      {() => (
        <Popover.Container className={panelWidth}>
          <Popover.Header title="Account settings" />
        </Popover.Container>
      )}
    </PopoverExample>

    <PopoverExample label="Title + no close">
      {() => (
        <Popover.Container className={panelWidth}>
          <Popover.Header title="Notifications" hideCloseButton />
        </Popover.Container>
      )}
    </PopoverExample>

    <PopoverExample label="Body only">
      {() => (
        <Popover.Container className={panelWidth}>
          <Popover.Body>
            A popover with just a body panel — no header or footer.
          </Popover.Body>
        </Popover.Container>
      )}
    </PopoverExample>

    <PopoverExample label="Footer only">
      {(close) => (
        <Popover.Container className={panelWidth}>
          <Popover.Footer
            actions={
              <Button size="xs" onClick={close}>
                Done
              </Button>
            }
          />
        </Popover.Container>
      )}
    </PopoverExample>

    <PopoverExample label="No outside close" closeOnInteractOutside={false}>
      {(close) => (
        <Popover.Container className={panelWidth}>
          <Popover.Header title="Stays open" />
          <Popover.Body>
            Clicking outside won&apos;t dismiss this popover — only the close
            button or Escape will.
          </Popover.Body>
          <Popover.Footer
            actions={
              <Button size="xs" onClick={close}>
                Close
              </Button>
            }
          />
        </Popover.Container>
      )}
    </PopoverExample>

    <PopoverExample label="Kitchen sink">
      {(close) => (
        <Popover.Container className={panelWidth}>
          <Popover.Header
            title="A deliberately long popover title that wraps across multiple lines"
            actions={
              <Button
                size="xxs"
                variant="ghost"
                iconName="gear"
                aria-label="Settings"
              />
            }
          />
          <Popover.Body>The first body holds the primary content.</Popover.Body>
          <Popover.Body>A second body renders as its own card.</Popover.Body>
          <Popover.Footer
            secondaryActions={
              <Button size="xs" variant="ghost" onClick={close}>
                Cancel
              </Button>
            }
            actions={
              <Button size="xs" onClick={close}>
                Apply
              </Button>
            }
          />
        </Popover.Container>
      )}
    </PopoverExample>
  </div>
);

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
          onClose={() => setOpen(false)}
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

/**
 * Overlays stacked three deep: a popover that opens a popover, which contains a
 * tooltip. Exercises portal + z-index layering and nested dismissal
 * (opening/clicking the inner popover must not dismiss the outer one).
 */
export const Stacking: Story = () => (
  <div style={{ padding: 60 }}>
    <PopoverExample label="Popover 1">
      {() => (
        <Popover.Container className={panelWidth}>
          <Popover.Header title="Popover 1" />
          <Popover.Body>
            <div className={css({ display: "grid", gap: "2" })}>
              <span>Opens a second popover, stacked on top of this one.</span>
              <PopoverExample label="Popover 2" position="right-start">
                {() => (
                  <Popover.Container className={panelWidth}>
                    <Popover.Header title="Popover 2" />
                    <Popover.Body>
                      <div className={css({ display: "grid", gap: "2" })}>
                        <span>Holds a tooltip.</span>
                        <span>
                          <Tooltip variant="light" content="Tooltip 1">
                            <Button size="xs">Hover for tooltip 1</Button>
                          </Tooltip>
                        </span>
                      </div>
                    </Popover.Body>
                  </Popover.Container>
                )}
              </PopoverExample>
            </div>
          </Popover.Body>
        </Popover.Container>
      )}
    </PopoverExample>
  </div>
);

export default {
  title: "Components/Popover",
} satisfies StoryDefault;
