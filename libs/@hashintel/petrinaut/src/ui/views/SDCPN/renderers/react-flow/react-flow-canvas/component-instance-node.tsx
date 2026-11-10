import { Handle, Position, type NodeProps } from "@xyflow/react";
import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  COMPONENT_INSTANCE_FOOTER_HEIGHT,
  COMPONENT_INSTANCE_HEADER_HEIGHT,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { nodeFocusStyle } from "../../../styles/focus";
import { iconContainerBaseStyle } from "./node-card";
import { portInHandleId, portOutHandleId } from "./port-handles";
import { pinColorStyle, pinStyle, portOnSide } from "./port-pin";

import type { CanvasInstanceBinding, CanvasPort } from "../../../canvas-scene";
import type { ComponentInstanceNodeType } from "./react-flow-types";

const containerStyle = css({
  position: "relative",
  height: "full",
});

const cardStyle = css({
  width: "full",
  height: "full",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  border: "1px solid",
  borderColor: "neutral.s70",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
  cursor: "default",
  // Contributed to the shadow `nodeFocusStyle` owns, so the focus glow
  // and the elevation can sit in one declaration.
  "--node-elevation": "0px 2px 9px rgba(0, 0, 0, 0.04)",
  _hover: {
    borderColor: "neutral.s100",
    "--node-elevation": "0px 4px 11px rgba(0, 0, 0, 0.1)",
  },
});

/** The header matches the compact place and transition cards: tile, name, kind. */
const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  height: `[${COMPONENT_INSTANCE_HEADER_HEIGHT}px]`,
  flexShrink: "0",
  padding: "[4px 6px 4px 4px]",
  borderBottom: "1px solid",
  borderBottomColor: "neutral.s30",
});

const iconTileStyle = css({
  borderRadius: "md",
});

const textStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "0",
  overflow: "hidden",
});

const titleStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1.2]",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const subtitleStyle = css({
  fontSize: "xs",
  color: "neutral.a90",
  lineHeight: "[1.2]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const unboundSubtitleStyle = css({
  color: "[#b45309]",
});

/**
 * Folds and unfolds the ports. `nodrag` and `nopan` keep React Flow from
 * turning the press into a drag of the card or a pan of the canvas.
 */
const foldToggleStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  width: "[22px]",
  height: "[22px]",
  border: "none",
  borderRadius: "sm",
  background: "[transparent]",
  color: "neutral.s90",
  cursor: "pointer",
  _hover: {
    backgroundColor: "neutral.s20",
    color: "neutral.s115",
  },
});

/**
 * Every part of a fold moves on one clock, which the canvas sets: the card's
 * height, its pins, their labels and the count that stands in for them.
 */
const foldMotionStyle = css({
  transitionDuration: "[var(--canvas-fold-duration, 180ms)]",
  transitionTimingFunction: "[cubic-bezier(0.22, 1, 0.36, 1)]",
});

/** Faded out, not unmounted, so a fold has something to fade. */
const fadedOutStyle = css({
  opacity: "[0]",
});

/** The chevron turns over as the card unfolds. */
const foldChevronStyle = css({
  display: "flex",
  transitionProperty: "[transform]",
});

const foldChevronTurnedStyle = css({
  transform: "[rotate(180deg)]",
});

/**
 * The folded body: how many ports the card hides, in place of their rows. It
 * keeps the height of a folded card's body, so it stays where it is while
 * the card grows under it.
 */
const foldedBodyStyle = css({
  flexShrink: "0",
  display: "flex",
  alignItems: "center",
  padding: "[0 14px]",
  fontSize: "xs",
  color: "neutral.a90",
  transitionProperty: "[opacity]",
});

const foldedBodyHeight =
  compactNodeDimensions.componentInstance.height -
  COMPONENT_INSTANCE_HEADER_HEIGHT;

const portLabelStyle = css({
  position: "absolute",
  fontSize: "[11px]",
  fontWeight: "medium",
  lineHeight: "[1]",
  color: "neutral.s105",
  maxWidth: "[44%]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  transform: "translateY(-50%)",
  transitionProperty: "[top, opacity]",
});

/** A folded card's pins shrink to wire ends: the links still show where they land. */
const foldedPinStyle = css({
  width: "[7px]",
  height: "[7px]",
  border: "[1px solid white]",
});

/** A pin slides to its row, and grows to its full size, as the card unfolds. */
const pinMotionStyle = css({
  transitionProperty: "[top, width, height, border-width]",
});

// A side the port does not use keeps its handle, so a link can still land
// there, but hides it: an input port pins the left edge, an output the right.
const unusedPinStyle = css({
  opacity: "[0]",
  pointerEvents: "none",
});

/** Where the label sits: beside the pin, or on the left for a two-way port. */
const PORT_LABEL_INSET = 12;

const describeBinding = (
  subnetName: string,
  binding: CanvasInstanceBinding,
): string => {
  if (binding.kind === "component") {
    return subnetName;
  }
  return binding.implementationName === null
    ? `${subnetName} · no implementation`
    : `${subnetName} · ${binding.implementationName}`;
};

const describeFoldedPorts = (ports: CanvasPort[]): string => {
  const inputs = ports.filter((port) => port.direction !== "out").length;
  const outputs = ports.filter((port) => port.direction !== "in").length;
  return `${inputs} in · ${outputs} out`;
};

/**
 * The centre of each port's pin, by side, within the body under the header.
 * Unfolded, every port has a row of its own and pins both sides of it, one
 * visible. Folded, the pins of each side spread along that side alone, so
 * the wires that land there stay apart.
 */
const pinCentres = (
  ports: CanvasPort[],
  height: number,
  expanded: boolean,
): { left: number[]; right: number[] } => {
  const bodyTop = COMPONENT_INSTANCE_HEADER_HEIGHT;
  const bodyHeight =
    height -
    COMPONENT_INSTANCE_HEADER_HEIGHT -
    COMPONENT_INSTANCE_FOOTER_HEIGHT;
  const spread = (count: number, index: number) =>
    bodyTop + (bodyHeight * (index + 0.5)) / count;
  if (expanded) {
    const rows = ports.map((_port, index) => spread(ports.length, index));
    return { left: rows, right: rows };
  }
  const bySide = (side: "left" | "right") => {
    const pinned = ports.filter((port) => portOnSide(port.direction, side));
    return ports.map((port) => {
      const index = pinned.indexOf(port);
      // A port that does not pin this side lands at the row of the side it
      // does pin, so a link arriving from the wrong side still ends level
      // with its port.
      const own = index === -1 ? pinned.length : index;
      return spread(
        Math.max(pinned.length, 1),
        Math.min(own, pinned.length - 1),
      );
    });
  };
  const left = bySide("left");
  const right = bySide("right");
  return {
    left: ports.map((port, index) =>
      portOnSide(port.direction, "left") ? left[index]! : right[index]!,
    ),
    right: ports.map((port, index) =>
      portOnSide(port.direction, "right") ? right[index]! : left[index]!,
    ),
  };
};

export const ComponentInstanceNode: React.FC<
  NodeProps<ComponentInstanceNodeType>
> = ({ data, selected }: NodeProps<ComponentInstanceNodeType>) => {
  const { toggleComponentInstanceExpanded } = use(EditorContext);

  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  const { ports, binding, expanded, foldable } = data;
  const isInterface = binding.kind === "interface";
  const unbound = isInterface && binding.implementationName === null;
  const centres = pinCentres(ports, data.height, expanded);

  return (
    <div className={containerStyle}>
      <div className={cx(cardStyle, nodeFocusStyle({ focus }))}>
        <div className={headerStyle}>
          <div className={cx(iconContainerBaseStyle, iconTileStyle)}>
            <Icon name={isInterface ? "puzzlePiece" : "cube"} />
          </div>
          <div className={textStyle}>
            <div className={titleStyle}>{data.label}</div>
            <div
              className={cx(
                subtitleStyle,
                unbound ? unboundSubtitleStyle : undefined,
              )}
            >
              {describeBinding(data.subnetName, binding)}
            </div>
          </div>
          {foldable ? (
            <button
              type="button"
              className={cx("nodrag", "nopan", foldToggleStyle)}
              aria-label={expanded ? "Hide ports" : "Show ports"}
              aria-expanded={expanded}
              onClick={(event) => {
                event.stopPropagation();
                toggleComponentInstanceExpanded(data.id);
              }}
            >
              <span
                className={cx(
                  foldChevronStyle,
                  foldMotionStyle,
                  expanded ? foldChevronTurnedStyle : undefined,
                )}
              >
                <Icon name="chevronDown" size="xs" />
              </span>
            </button>
          ) : null}
        </div>
        {foldable ? (
          <div
            className={cx(
              foldedBodyStyle,
              foldMotionStyle,
              expanded ? fadedOutStyle : undefined,
            )}
            style={{ height: foldedBodyHeight }}
            aria-hidden={expanded}
          >
            {describeFoldedPorts(ports)}
          </div>
        ) : null}
      </div>

      {ports.map((port, index) => {
        const pinColor = pinColorStyle(port.typeColor);
        const leftTop = centres.left[index]!;
        const rightTop = centres.right[index]!;
        return (
          <div key={port.id}>
            {/* Both pins are source handles: a connection's source is then
                where the drag began, whichever pin that was. */}
            <Handle
              type="source"
              position={Position.Left}
              id={portInHandleId(port.id)}
              className={cx(
                pinStyle,
                pinMotionStyle,
                foldMotionStyle,
                expanded ? undefined : foldedPinStyle,
                portOnSide(port.direction, "left") ? undefined : unusedPinStyle,
              )}
              style={{ top: leftTop, ...pinColor }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id={portOutHandleId(port.id)}
              className={cx(
                pinStyle,
                pinMotionStyle,
                foldMotionStyle,
                expanded ? undefined : foldedPinStyle,
                portOnSide(port.direction, "right")
                  ? undefined
                  : unusedPinStyle,
              )}
              style={{ top: rightTop, ...pinColor }}
            />
            <span
              className={cx(
                portLabelStyle,
                foldMotionStyle,
                expanded ? undefined : fadedOutStyle,
              )}
              style={{
                top: leftTop,
                ...(port.direction === "out"
                  ? { right: PORT_LABEL_INSET }
                  : { left: PORT_LABEL_INSET }),
              }}
              aria-hidden={!expanded}
            >
              {port.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};
