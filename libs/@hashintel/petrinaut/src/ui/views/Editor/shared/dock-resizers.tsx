import { useEffect, useRef, type ReactNode } from "react";
import {
  Group,
  Panel,
  Separator,
  usePanelRef,
  type PanelImperativeHandle,
} from "react-resizable-panels";

import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
import { useUserSettings } from "../../../../react/state/user-settings-context";
import { useReading } from "../../../lib/readings";
import { docks, type DockName } from "./docks";

import type { MotionValue } from "motion";

/** How wide the strip along a panel's edge is that a pointer can grab, in pixels. */
const GRAB_SIZE = 8;
/** The same for a finger. */
const COARSE_GRAB_SIZE = 24;

const groupStyle = css({
  width: "[100%]",
  height: "[100%]",
});

// Over the canvas and its panels, and out of the pointer's way everywhere
// but on the separators.
const layerStyle = css({
  position: "absolute",
  inset: "[0]",
  zIndex: "sticky",
  pointerEvents: "none",
});

// A group inside this one is stacked over this one's separator. Where two
// separators meet, the library then takes a press on either for both.
const restStyle = css({
  position: "relative",
  zIndex: "[1]",
});

/**
 * The separator is a line with no thickness on the panel's edge, so that
 * the stand-in beside it is as large as the panel. `::before` is the strip a
 * pointer grabs and `::after` the one that shows.
 */
const separatorStyle = cva({
  base: {
    position: "relative",
    pointerEvents: "auto",
    "--grab-size": `[${GRAB_SIZE}px]`,
    "@media (pointer: coarse)": {
      "--grab-size": `[${COARSE_GRAB_SIZE}px]`,
    },
    "&[aria-disabled]": { pointerEvents: "none" },
    _before: { content: '""', position: "absolute" },
    _after: {
      content: '""',
      position: "absolute",
      pointerEvents: "none",
      transition: "[background-color 0.3s ease]",
    },
    "&[data-separator=hover]::after": { backgroundColor: "neutral.a30" },
    "&[data-separator=focus]::after": { backgroundColor: "blue.a40" },
    // The strip tints, and the panel's border under it turns blue: the
    // border's pixel is painted over with the panel's background, the blue,
    // and the tint again.
    "&[data-separator=active]::after": {
      backgroundColor: "blue.a40",
      backgroundImage:
        "[linear-gradient(var(--line-direction), transparent 2px, {colors.blue.a40} 2px 3px, transparent 3px), linear-gradient(var(--line-direction), transparent 2px, {colors.blue.a70} 2px 3px, transparent 3px), linear-gradient(var(--line-direction), transparent 2px, {colors.neutral.s00} 2px 3px, transparent 3px)]",
    },
  },
  variants: {
    edge: {
      // The strip that shows is five pixels around the panel's border, which
      // lies just outside the size the stand-in has: two inside the panel,
      // the border, and two outside.
      left: {
        width: "[0]",
        "--line-direction": "to right",
        _before: {
          insetBlock: "[0]",
          left: "[calc(var(--grab-size) / -2)]",
          width: "[var(--grab-size)]",
        },
        _after: { insetBlock: "[0]", left: "[-2px]", width: "[5px]" },
      },
      right: {
        width: "[0]",
        // Down to the bottom panel's edge and over it, so that the two
        // separators cross.
        marginBottom: "[calc(var(--grab-size) / -2)]",
        "--line-direction": "to right",
        _before: {
          insetBlock: "[0]",
          left: "[calc(var(--grab-size) / -2)]",
          width: "[var(--grab-size)]",
        },
        _after: {
          top: "[0]",
          bottom: "[calc(var(--grab-size) / 2)]",
          left: "[-3px]",
          width: "[5px]",
        },
      },
      bottom: {
        height: "[0]",
        // Over the left sidebar's edge, so that the two separators cross.
        marginLeft: "[calc(var(--grab-size) / -2)]",
        "--line-direction": "to bottom",
        _before: {
          insetInline: "[0]",
          top: "[calc(var(--grab-size) / -2)]",
          height: "[var(--grab-size)]",
        },
        _after: {
          left: "[calc(var(--grab-size) / 2)]",
          right: "[0]",
          top: "[-3px]",
          height: "[5px]",
        },
      },
    },
  },
});

/** Whether a pointer is dragging the separator. The library marks it. */
const isDragged = (separator: HTMLElement | null) =>
  separator?.getAttribute("data-separator") === "active";

/** Brings a stand-in back to its panel's size, unless a drag is leading. */
const follow = (
  standIn: PanelImperativeHandle | null,
  separator: HTMLElement | null,
  size: MotionValue<number>,
) => {
  if (
    standIn &&
    !isDragged(separator) &&
    Math.abs(standIn.getSize().inPixels - size.get()) > 0.5
  ) {
    standIn.resize(size.get());
  }
};

/**
 * One docked panel's stand-in and the separator on its inner edge, beside
 * whatever fills the rest of the group.
 *
 * The panel itself is not in the group: its box follows its size and its
 * presence, which are Motion values. The stand-in is an empty panel of the
 * same size at the same place. A drag of the separator resizes the stand-in,
 * and the stand-in's size is written to the panel's. At any other time the
 * stand-in follows the panel.
 */
const DockGroup = ({
  panel,
  className,
  children,
}: {
  panel: DockName;
  className?: string;
  children?: ReactNode;
}) => {
  const dock = docks[panel];
  const size = usePanelSizes()[dock.size];
  const shown = usePanelPresence().shown[panel];
  const saveSize = useUserSettings((settings) => settings[dock.saveSize]);
  const isOpen = useReading(() => shown.get() === 1);
  const isVertical = dock.edge === "bottom";
  const standInRef = usePanelRef();
  const groupRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const followSize = () =>
      follow(standInRef.current, separatorRef.current, size);
    followSize();
    return size.on("change", followSize);
  }, [isOpen, size, standInRef]);

  const standIn = (
    <Panel
      id={panel}
      panelRef={standInRef}
      defaultSize={isOpen ? size.get() : 0}
      minSize={isOpen ? dock.minSize : 0}
      maxSize={isOpen ? dock.maxSize : 0}
      groupResizeBehavior="preserve-pixel-size"
      onResize={({ inPixels }) => {
        if (!isOpen) {
          return;
        }
        // A drag leads the panel. Anything else that moved the stand-in,
        // such as a window that shrank or a layout the library kept from
        // before the view was hidden, is undone as far as there is room.
        if (isDragged(separatorRef.current)) {
          size.set(inPixels);
        } else {
          follow(standInRef.current, separatorRef.current, size);
        }
      }}
    />
  );
  const separator = (
    <Separator
      elementRef={separatorRef}
      aria-label={dock.label}
      disabled={!isOpen}
      disableDoubleClick
      className={separatorStyle({ edge: dock.edge })}
    />
  );
  const rest = (
    <Panel className={restStyle} style={{ overflow: "visible" }}>
      {children}
    </Panel>
  );

  return (
    <Group
      orientation={isVertical ? "vertical" : "horizontal"}
      resizeTargetMinimumSize={{ fine: GRAB_SIZE, coarse: COARSE_GRAB_SIZE }}
      elementRef={groupRef}
      className={cx(groupStyle, className)}
      style={{ overflow: "visible" }}
      onLayoutChanged={(layout, { isUserInteraction }) => {
        const group = groupRef.current?.getBoundingClientRect();
        const share = layout[panel];
        // A drag or a key press ends here: the panel takes the size and
        // keeps it. The size is read off the layout, which a key press
        // reports before the stand-in has it.
        if (isOpen && isUserInteraction && group && share !== undefined) {
          const pixels =
            (share / 100) * (isVertical ? group.height : group.width);
          size.set(pixels);
          saveSize(pixels);
        }
      }}
    >
      {dock.edge === "left" ? (
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

/**
 * The separators that resize the panels docked around the canvas, as a layer
 * over them.
 *
 * The groups nest the way the panels sit: the left sidebar beside everything
 * else, the bottom panel under what is left, and the properties panel beside
 * the canvas. A press where two separators cross resizes both panels.
 */
export const DockResizers = () => (
  <DockGroup panel="leftSidebar" className={layerStyle}>
    <DockGroup panel="bottomPanel">
      <DockGroup panel="propertiesPanel" />
    </DockGroup>
  </DockGroup>
);
