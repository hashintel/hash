/**
 * @layerRoot ui.resize
 * @role Resizing a panel by its edge with the separators of react-resizable-panels
 */
import { useEffect, useRef, type ReactNode } from "react";
import {
  Group,
  Panel,
  usePanelRef,
  type PanelImperativeHandle,
} from "react-resizable-panels";

import { css, cx } from "@hashintel/ds-helpers/css";

import { EdgeSeparator } from "./edge-separator";
import { grabSize } from "./edge-separator-style";

import type { MotionValue } from "motion";

const groupStyle = css({
  width: "[100%]",
  height: "[100%]",
});

// A group inside this one is stacked over this one's separator. Where two
// separators meet, the library then takes a press on either for both.
const restStyle = css({
  position: "relative",
  zIndex: "[1]",
});

/** Whether a pointer is dragging the group's separator. The library marks it. */
const isDragged = (group: HTMLElement | null) =>
  [...(group?.children ?? [])].some(
    (child) => child.getAttribute("data-separator") === "active",
  );

/** Brings a stand-in back to its panel's size, unless a drag is leading. */
const follow = (
  standIn: PanelImperativeHandle | null,
  group: HTMLElement | null,
  size: MotionValue<number>,
) => {
  if (
    standIn &&
    !isDragged(group) &&
    Math.abs(standIn.getSize().inPixels - size.get()) > 0.5
  ) {
    standIn.resize(size.get());
  }
};

interface PanelResizerProps {
  /** A name for the stand-in, unique among the resizers nested together. */
  id: string;
  /** The edge of this group the panel sits on. */
  edge: "left" | "right" | "bottom";
  /** The panel's size along the resized axis, in pixels. */
  size: MotionValue<number>;
  /** Whether the panel is in place. Otherwise its separator does nothing. */
  isOpen: boolean;
  minSize: number;
  maxSize: number;
  /** The separator's accessible name. */
  label: string;
  /** Called with the size when a drag ends. */
  onCommit?: (pixels: number) => void;
  /** Whether a drag paints the panel's border, which lies under the strip. */
  paintsBorder?: boolean;
  className?: string;
  /** In place of the default stacking of the rest, for the outermost resizer. */
  restClassName?: string;
  separatorClassName?: string;
  /** What fills the rest of the group: often the resizer of the next panel in. */
  children?: ReactNode;
}

/**
 * The separator that resizes a panel whose box follows a Motion value, as a
 * group of `react-resizable-panels` laid over the panel and what is beside
 * it.
 *
 * The panel itself is not in the group. An empty stand-in of the same size
 * is, at the same place. A drag of the separator resizes the stand-in, and
 * the stand-in's size is written to the panel's. At any other time the
 * stand-in follows the panel.
 *
 * Nest one resizer in another for panels that share a corner: a press where
 * the two separators cross resizes both.
 */
export const PanelResizer = ({
  id,
  edge,
  size,
  isOpen,
  minSize,
  maxSize,
  label,
  onCommit,
  paintsBorder,
  className,
  restClassName = restStyle,
  separatorClassName,
  children,
}: PanelResizerProps) => {
  const isVertical = edge === "bottom";
  const standInRef = usePanelRef();
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const followSize = () => follow(standInRef.current, groupRef.current, size);
    followSize();
    return size.on("change", followSize);
  }, [isOpen, size, standInRef]);

  const standIn = (
    <Panel
      id={id}
      panelRef={standInRef}
      defaultSize={isOpen ? size.get() : 0}
      minSize={isOpen ? minSize : 0}
      maxSize={isOpen ? maxSize : 0}
      groupResizeBehavior="preserve-pixel-size"
      onResize={({ inPixels }) => {
        if (!isOpen) {
          return;
        }
        // A drag leads the panel. Anything else that moved the stand-in,
        // such as a window that shrank or a layout the library kept from
        // before the view was hidden, is undone as far as there is room.
        // Whole pixels: the library lays out in shares of the group, which
        // come back as a size just off the pixel the pointer is on.
        if (isDragged(groupRef.current)) {
          size.set(Math.round(inPixels));
        } else {
          follow(standInRef.current, groupRef.current, size);
        }
      }}
    />
  );
  const separator = (
    <EdgeSeparator
      edge={edge}
      label={label}
      paintsBorder={paintsBorder}
      disabled={!isOpen}
      className={separatorClassName}
    />
  );
  const rest = (
    <Panel className={restClassName} style={{ overflow: "visible" }}>
      {children}
    </Panel>
  );

  return (
    <Group
      orientation={isVertical ? "vertical" : "horizontal"}
      resizeTargetMinimumSize={grabSize}
      elementRef={groupRef}
      className={cx(groupStyle, className)}
      style={{ overflow: "visible" }}
      onLayoutChanged={(layout, { isUserInteraction }) => {
        const group = groupRef.current?.getBoundingClientRect();
        const share = layout[id];
        // A drag ends here: the panel takes the size and keeps it. The size
        // is read off the layout, which the library may report before the
        // stand-in has it.
        if (isOpen && isUserInteraction && group && share !== undefined) {
          const pixels = Math.round(
            (share / 100) * (isVertical ? group.height : group.width),
          );
          size.set(pixels);
          onCommit?.(pixels);
        }
      }}
    >
      {edge === "left" ? (
        <>
          {standIn}
          {separator}
          {rest}
        </>
      ) : (
        <>
          {rest}
          {separator}
          {standIn}
        </>
      )}
    </Group>
  );
};
