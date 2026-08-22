import { type NodeProps } from "@xyflow/react";
import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../react/state/editor-context";
import { EXPANDED_FRAME_HEADER_HEIGHT } from "../hooks/use-expanded-subnets";

import type { ComponentInstanceExpandedNodeType } from "../reactflow-types";

const frameStyle = cva({
  base: {
    width: "full",
    height: "full",
    border: "2px dashed",
    borderColor: "neutral.s60",
    borderRadius: "sm",
    backgroundColor: "[rgba(243, 245, 247, 0.75)]",
    transition: "[outline 0.2s ease, box-shadow 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    _hover: {
      outline: "[4px solid rgba(75, 126, 156, 0.15)]",
    },
  },
  variants: {
    selection: {
      resource: {
        outline: "[4px solid rgba(59, 178, 246, 0.6)]",
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

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  padding: "[0 12px]",
  borderBottom: "1px solid",
  borderColor: "neutral.s40",
  backgroundColor: "[rgba(233, 236, 240, 0.9)]",
  borderTopRadius: "sm",
  cursor: "grab",
});

const titleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const subtitleStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const hintStyle = css({
  marginLeft: "auto",
  fontSize: "[10px]",
  color: "neutral.s70",
  whiteSpace: "nowrap",
});

const iconStyle = css({
  color: "neutral.s90",
  flexShrink: "0",
});

/**
 * Frame node rendered when a component instance is expanded in place
 * (FE-874 prototype). The subnet's internal places/transitions are separate
 * React Flow child nodes (`parentId`) rendered on top of this frame.
 */
export const ExpandedComponentInstanceNode: React.FC<
  NodeProps<ComponentInstanceExpandedNodeType>
> = ({ id, data, selected }: NodeProps<ComponentInstanceExpandedNodeType>) => {
  const { isSelected } = use(EditorContext);

  const selectionVariant = isSelected(id)
    ? "resource"
    : selected
      ? "reactflow"
      : "none";

  return (
    <div className={frameStyle({ selection: selectionVariant })}>
      <div
        className={headerStyle}
        style={{ height: EXPANDED_FRAME_HEADER_HEIGHT - 2 }}
      >
        <Icon name="cube" className={iconStyle} />
        <span className={titleStyle}>{data.label}</span>
        <span className={subtitleStyle}>{data.subnetName}</span>
        <span className={hintStyle}>double-click to collapse</span>
      </div>
    </div>
  );
};
