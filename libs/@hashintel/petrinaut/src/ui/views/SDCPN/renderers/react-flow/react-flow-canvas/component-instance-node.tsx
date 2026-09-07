import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { nodeFocusStyle } from "../../../styles/focus";
import { portInHandleId, portOutHandleId } from "./port-handles";

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

const portLabelStyle = css({
  position: "absolute",
  fontSize: "[9px]",
  color: "neutral.s80",
  whiteSpace: "nowrap",
  pointerEvents: "none",
});

export const ComponentInstanceNode: React.FC<
  NodeProps<ComponentInstanceNodeType>
> = ({ data, selected }: NodeProps<ComponentInstanceNodeType>) => {
  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  const { ports } = data;
  const portCount = ports.length;

  return (
    <div className={containerStyle}>
      {ports.map((port, index) => {
        const topPercent =
          portCount === 1 ? 50 : (index / (portCount - 1)) * 100;

        return (
          <div key={portInHandleId(port.id)}>
            <Handle
              type="target"
              position={Position.Left}
              id={portInHandleId(port.id)}
              className={portStyle}
              style={{
                top: `${topPercent}%`,
                left: -PORT_OFFSET,
              }}
            />
            <span
              className={portLabelStyle}
              style={{
                top: `${topPercent}%`,
                left: PORT_SIZE + 4,
                transform: "translateY(-50%)",
              }}
            >
              {port.name}
            </span>
          </div>
        );
      })}

      <div className={`${cardStyle} ${nodeFocusStyle({ focus })}`}>
        <Icon name="cube" className={iconStyle} />
        <div className={titleStyle}>{data.label}</div>
        <div className={subtitleStyle}>{data.subnetName}</div>
      </div>

      {ports.map((port, index) => {
        const topPercent =
          portCount === 1 ? 50 : (index / (portCount - 1)) * 100;

        return (
          <Handle
            key={portOutHandleId(port.id)}
            type="source"
            position={Position.Right}
            id={portOutHandleId(port.id)}
            className={portStyle}
            style={{
              top: `${topPercent}%`,
              right: -PORT_OFFSET,
            }}
          />
        );
      })}
    </div>
  );
};
