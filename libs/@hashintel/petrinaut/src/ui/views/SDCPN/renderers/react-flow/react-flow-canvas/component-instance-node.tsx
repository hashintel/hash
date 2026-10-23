import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { nodeFocusStyle } from "../../../styles/focus";
import { portInHandleId, portOutHandleId } from "./port-handles";

import type { CanvasPort } from "../../../canvas-scene";
import type { ComponentInstanceNodeType } from "./react-flow-types";

const PORT_SIZE = 10;
const PORT_OFFSET = PORT_SIZE / 2;

const containerStyle = css({
  position: "relative",
  height: "full",
});

const cardStyle = css({
  width: "full",
  height: "full",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1",
  padding: "3",
  border: "2px solid",
  borderColor: "neutral.s60",
  borderRadius: "sm",
  backgroundColor: "neutral.s15",
  cursor: "default",
  // Contributed to the shadow `nodeFocusStyle` owns, so the focus glow
  // and the elevation can sit in one declaration.
  "--node-elevation": "0px 2px 9px rgba(0, 0, 0, 0.04)",
  _hover: { "--node-elevation": "0px 4px 11px rgba(0, 0, 0, 0.1)" },
});

const titleStyle = css({
  maxWidth: "full",
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "[1.2]",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const subtitleStyle = css({
  maxWidth: "full",
  fontSize: "xs",
  color: "neutral.s80",
  lineHeight: "[1.2]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const iconStyle = css({
  color: "neutral.s90",
});

const portStyle = css({
  width: `[${PORT_SIZE}px]`,
  height: `[${PORT_SIZE}px]`,
  background: "[#6b7280]",
  borderRadius: "full",
  border: "none",
  zIndex: "[3]",
});

// A side the port does not use keeps its handle, so a link can still land
// there, but hides it: an input port shows on the left, an output on the right.
const unusedPortStyle = css({
  opacity: "[0]",
  pointerEvents: "none",
});

const portLabelStyle = css({
  position: "absolute",
  fontSize: "[9px]",
  color: "neutral.s80",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  gap: "[2px]",
});

const directionGlyphStyle = css({
  fontSize: "[8px]",
  color: "neutral.s70",
});

/** Where a port draws its dot and label: the side its tokens come from. */
const portSide = (port: CanvasPort): "left" | "right" =>
  port.direction === "out" ? "right" : "left";

const PortLabel = ({ port, top }: { port: CanvasPort; top: string }) => {
  const side = portSide(port);
  return (
    <span
      className={portLabelStyle}
      style={{
        top,
        ...(side === "left"
          ? { left: PORT_SIZE + 4 }
          : { right: PORT_SIZE + 4, flexDirection: "row-reverse" }),
        transform: "translateY(-50%)",
      }}
    >
      <span className={directionGlyphStyle} aria-hidden>
        {port.direction === "in" ? "▸" : port.direction === "out" ? "▸" : "◂▸"}
      </span>
      {port.name}
    </span>
  );
};

export const ComponentInstanceNode: React.FC<
  NodeProps<ComponentInstanceNodeType>
> = ({ data, selected }: NodeProps<ComponentInstanceNodeType>) => {
  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  const { ports } = data;
  const portCount = ports.length;
  const topOf = (index: number) =>
    `${portCount === 1 ? 50 : (index / (portCount - 1)) * 100}%`;

  return (
    <div className={containerStyle}>
      {ports.map((port, index) => (
        <div key={portInHandleId(port.id)}>
          <Handle
            type="target"
            position={Position.Left}
            id={portInHandleId(port.id)}
            className={cx(
              portStyle,
              port.direction === "out" ? unusedPortStyle : undefined,
            )}
            style={{ top: topOf(index), left: -PORT_OFFSET }}
          />
          <PortLabel port={port} top={topOf(index)} />
        </div>
      ))}

      <div className={`${cardStyle} ${nodeFocusStyle({ focus })}`}>
        <Icon name="cube" className={iconStyle} />
        <div className={titleStyle}>{data.label}</div>
        <div className={subtitleStyle}>{data.subnetName}</div>
      </div>

      {ports.map((port, index) => (
        <Handle
          key={portOutHandleId(port.id)}
          type="source"
          position={Position.Right}
          id={portOutHandleId(port.id)}
          className={cx(
            portStyle,
            port.direction === "in" ? unusedPortStyle : undefined,
          )}
          style={{ top: topOf(index), right: -PORT_OFFSET }}
        />
      ))}
    </div>
  );
};
