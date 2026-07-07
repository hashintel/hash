import { Handle, Position, type NodeProps } from "@xyflow/react";
import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../react/state/editor-context";

import type { ComponentInstanceNodeType } from "../reactflow-types";

const PORT_SIZE = 10;
const PORT_OFFSET = PORT_SIZE / 2;

const containerStyle = css({
  position: "relative",
});

const cardStyle = cva({
  base: {
    width: "[180px]",
    minHeight: "[96px]",
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
    transition: "[all 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    shadow: "[0px 2px 9px rgba(0, 0, 0, 0.04)]",
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
      notSelectedConnection: {
        opacity: "[0.5]",
      },
      none: {},
    },
  },
  defaultVariants: {
    selection: "none",
  },
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
> = ({ id, data, selected }: NodeProps<ComponentInstanceNodeType>) => {
  const {
    isSelected,
    isNotSelectedConnection,
    hoveredItem,
    isNotHoveredConnection,
  } = use(EditorContext);

  const isInSelection = isSelected(id);
  const selectionVariant = isInSelection
    ? "resource"
    : selected
      ? "reactflow"
      : isNotHoveredConnection(id) ||
          (!hoveredItem && isNotSelectedConnection(id))
        ? "notSelectedConnection"
        : "none";

  const { ports } = data;
  const portCount = ports.length;

  return (
    <div className={containerStyle}>
      {ports.map((port, index) => {
        const topPercent =
          portCount === 1 ? 50 : (index / (portCount - 1)) * 100;

        return (
          <div key={`port-in-${port.id}`}>
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
        <Icon name="cube" className={iconStyle} />
        <div className={titleStyle}>{data.label}</div>
        <div className={subtitleStyle}>{data.subnetName}</div>
      </div>

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
