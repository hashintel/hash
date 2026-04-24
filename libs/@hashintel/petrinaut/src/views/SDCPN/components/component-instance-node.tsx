import { css, cva } from "@hashintel/ds-helpers/css";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { use } from "react";

import { EditorContext } from "../../../state/editor-context";
import type { ComponentInstanceNodeType } from "../reactflow-types";

const PORT_SIZE = 10;
const PORT_OFFSET = PORT_SIZE / 2;

const containerStyle = css({
  position: "relative",
});

const cardStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5",
    padding: "3",
    border: "[2px solid]",
    borderColor: "neutral.s60",
    borderRadius: "[0px]",
    backgroundColor: "neutral.s15",
    cursor: "default",
    transition: "[all 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    shadow: "[0px 2px 9px rgba(0, 0, 0, 0.04)]",
    minWidth: "[120px]",
    _hover: {
      outline: "[4px solid rgba(75, 126, 156, 0.2)]",
      shadow: "[0px 4px 11px rgba(0, 0, 0, 0.1)]",
    },
  },
  variants: {
    selection: {
      resource: {
        outline: "[4px solid rgba(59, 178, 246, 0.6)]",
        _hover: {
          outline: "[4px solid rgba(59, 178, 246, 0.7)]",
        },
      },
      reactflow: {
        outline: "[4px solid rgba(40, 172, 233, 0.6)]",
      },
      none: {},
    },
  },
  defaultVariants: {
    selection: "none",
  },
});

const titleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "[1.2]",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "[100%]",
});

const subtitleStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  lineHeight: "[1.2]",
});

const portStyle = css({
  width: `[${PORT_SIZE}px]`,
  height: `[${PORT_SIZE}px]`,
  background: "[#6b7280]",
  borderRadius: "[50%]",
  border: "none",
  zIndex: 3,
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
> = ({ id, data, selected }: NodeProps<ComponentInstanceNodeType>) => {
  const { isSelected } = use(EditorContext);

  const isInSelection = isSelected(id);
  const selectionVariant = isInSelection
    ? "resource"
    : selected
      ? "reactflow"
      : "none";

  const { ports } = data;
  const portCount = ports.length;

  return (
    <div className={containerStyle}>
      {/* Left-side ports */}
      {ports.map((port, index) => {
        const topPercent =
          portCount === 1 ? 50 : (index / (portCount - 1)) * 100;

        return (
          <div key={`port-${port.id}`}>
            <Handle
              type="target"
              position={Position.Left}
              id={`port-in-${port.id}`}
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

      <div className={cardStyle({ selection: selectionVariant })}>
        <div className={titleStyle}>{data.label}</div>
        <div className={subtitleStyle}>{data.subnetName}</div>
      </div>

      {/* Right-side ports */}
      {ports.map((port, index) => {
        const topPercent =
          portCount === 1 ? 50 : (index / (portCount - 1)) * 100;

        return (
          <Handle
            key={`port-out-${port.id}`}
            type="source"
            position={Position.Right}
            id={`port-out-${port.id}`}
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
