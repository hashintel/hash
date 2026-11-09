import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  COMPONENT_INSTANCE_FOOTER_HEIGHT,
  COMPONENT_INSTANCE_HEADER_HEIGHT,
} from "@hashintel/petrinaut-core";

import { nodeFocusStyle } from "../../../styles/focus";
import { iconContainerBaseStyle } from "./node-card";
import { portInHandleId, portOutHandleId } from "./port-handles";
import { pinColorStyle, pinStyle, portOnSide } from "./port-pin";

import type { CanvasInstanceBinding } from "../../../canvas-scene";
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
  padding: "[4px 10px 4px 4px]",
  borderBottom: "1px solid",
  borderBottomColor: "neutral.s30",
});

const iconTileStyle = css({
  borderRadius: "md",
});

const textStyle = css({
  display: "flex",
  flexDirection: "column",
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

export const ComponentInstanceNode: React.FC<
  NodeProps<ComponentInstanceNodeType>
> = ({ data, selected }: NodeProps<ComponentInstanceNodeType>) => {
  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  const { ports, binding } = data;
  const isInterface = binding.kind === "interface";
  const unbound = isInterface && binding.implementationName === null;

  // One row per port under the header, the rows sharing the height the
  // scene gave the node (`getComponentInstanceHeight`).
  const rowHeight =
    ports.length === 0
      ? 0
      : (data.height -
          COMPONENT_INSTANCE_HEADER_HEIGHT -
          COMPONENT_INSTANCE_FOOTER_HEIGHT) /
        ports.length;
  const rowCentre = (index: number) =>
    COMPONENT_INSTANCE_HEADER_HEIGHT + rowHeight * (index + 0.5);

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
        </div>
      </div>

      {ports.map((port, index) => {
        const top = rowCentre(index);
        const pinColor = pinColorStyle(port.typeColor);
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
                portOnSide(port.direction, "left") ? undefined : unusedPinStyle,
              )}
              style={{ top, ...pinColor }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id={portOutHandleId(port.id)}
              className={cx(
                pinStyle,
                portOnSide(port.direction, "right")
                  ? undefined
                  : unusedPinStyle,
              )}
              style={{ top, ...pinColor }}
            />
            <span
              className={portLabelStyle}
              style={{
                top,
                ...(port.direction === "out"
                  ? { right: PORT_LABEL_INSET }
                  : { left: PORT_LABEL_INSET }),
              }}
            >
              {port.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};
