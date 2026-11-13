import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import { use, useEffect } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { componentInstanceHeaderHeight } from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { problemTextStyle } from "../../../../../constants/problem-severity";
import { nodeFocusStyle } from "../../../styles/focus";
import { iconContainerBaseStyle } from "./node-card";
import { pinLayout, pinSides, portOnSide } from "./pin-layout";
import { portInHandleId, portOutHandleId } from "./port-handles";
import { pinColorStyle, pinStyle } from "./port-pin";

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
  height: `[${componentInstanceHeaderHeight}px]`,
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

const portLabelStyle = css({
  position: "absolute",
  fontSize: "[11px]",
  fontWeight: "medium",
  lineHeight: "[1]",
  color: "neutral.s105",
  // An unfolded port has its row to itself, short of the pin on each edge.
  maxWidth: "[calc(100% - 24px)]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  transform: "translateY(-50%)",
  transitionProperty: "[top, opacity]",
});

/** A pin slides to its row, and grows to its full size, as the card unfolds. */
const pinMotionStyle = css({
  transitionProperty: "[top, width, height, border-width]",
});

/** How far in from the card's edge a port's name starts. */
const portLabelInset = 12;

const handles = {
  left: { position: Position.Left, idOf: portInHandleId },
  right: { position: Position.Right, idOf: portOutHandleId },
};

/**
 * What the card says under its name: the component, or for an instance of an
 * interface what runs for it. The line is short, so it leads with that.
 */
const describeBinding = (
  subnetName: string,
  binding: CanvasInstanceBinding,
): string =>
  binding.kind === "component"
    ? subnetName
    : (binding.implementationName ?? "no implementation");

const describeFoldedPorts = (ports: CanvasPort[]): string => {
  const inputs = ports.filter((port) => port.direction !== "out").length;
  const outputs = ports.filter((port) => port.direction !== "in").length;
  return `${inputs} in · ${outputs} out`;
};

export const ComponentInstanceNode: React.FC<
  NodeProps<ComponentInstanceNodeType>
> = ({
  data,
  selected,
  isConnectable,
}: NodeProps<ComponentInstanceNodeType>) => {
  const { toggleComponentInstanceFold } = use(EditorContext);
  const updateNodeInternals = useUpdateNodeInternals();

  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  const { ports, binding, unfolded, foldable } = data;
  const isInterface = binding.kind === "interface";
  const unbound = isInterface && binding.implementationName === null;
  const runs = describeBinding(data.subnetName, binding);

  // React Flow measures a handle when its node resizes. A port that comes or
  // goes on a card that keeps its height is measured here, and the pins the
  // change moved once they have slid into place.
  const portIds = ports.map(({ id }) => id).join(" ");
  useEffect(() => {
    updateNodeInternals(data.id);
  }, [updateNodeInternals, data.id, portIds]);

  return (
    <div
      className={containerStyle}
      onTransitionEnd={(event) => {
        if (event.propertyName === "top") {
          updateNodeInternals(data.id);
        }
      }}
    >
      <div className={cx(cardStyle, nodeFocusStyle({ focus }))}>
        <div className={headerStyle}>
          <div className={cx(iconContainerBaseStyle, iconTileStyle)}>
            <Icon name={isInterface ? "puzzlePiece" : "cube"} />
          </div>
          <div className={textStyle}>
            <div className={titleStyle}>{data.label}</div>
            <div
              className={cx(subtitleStyle, problemTextStyle)}
              data-severity={unbound ? "error" : undefined}
              title={isInterface ? `${data.subnetName}: ${runs}` : undefined}
            >
              {runs}
            </div>
          </div>
          {foldable ? (
            <button
              type="button"
              // `nokey`: Space and Enter fold the card without selecting it.
              className={cx("nodrag", "nopan", "nokey", foldToggleStyle)}
              aria-label="Ports"
              aria-expanded={unfolded}
              onClick={(event) => {
                event.stopPropagation();
                toggleComponentInstanceFold(data.id);
              }}
            >
              <span
                className={cx(
                  foldChevronStyle,
                  foldMotionStyle,
                  unfolded ? foldChevronTurnedStyle : undefined,
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
              unfolded ? fadedOutStyle : undefined,
            )}
            // The body of the card folded, whatever height the card has now.
            style={{
              height:
                data.height -
                2 * data.anchorOffset -
                componentInstanceHeaderHeight,
            }}
            aria-hidden={unfolded}
          >
            {describeFoldedPorts(ports)}
          </div>
        ) : null}
      </div>

      {pinLayout(ports, data.height, unfolded).map(({ port, ...tops }) => (
        <div key={port.id}>
          {pinSides.map((side) => {
            // A side the port does not use keeps its pin, hidden, so a link
            // that reaches the card from that side has somewhere to end.
            // Nothing is drawn from it or dropped on it.
            const shown = portOnSide(port.direction, side);
            return (
              <Handle
                key={side}
                // Both pins are source handles: a connection's source is then
                // where the drag began, whichever pin that was.
                type="source"
                position={handles[side].position}
                id={handles[side].idOf(port.id)}
                title={shown ? port.name : undefined}
                isConnectable={isConnectable}
                isConnectableStart={shown}
                isConnectableEnd={shown}
                className={cx(
                  pinStyle({
                    size: unfolded ? "full" : "wireEnd",
                    hidden: !shown,
                  }),
                  pinMotionStyle,
                  foldMotionStyle,
                )}
                style={{ top: tops[side], ...pinColorStyle(port.typeColor) }}
              />
            );
          })}
          <span
            className={cx(
              portLabelStyle,
              foldMotionStyle,
              unfolded ? undefined : fadedOutStyle,
            )}
            style={{
              top: tops.left,
              [port.direction === "out" ? "right" : "left"]: portLabelInset,
            }}
            aria-hidden={!unfolded}
          >
            {port.name}
          </span>
        </div>
      ))}
    </div>
  );
};
