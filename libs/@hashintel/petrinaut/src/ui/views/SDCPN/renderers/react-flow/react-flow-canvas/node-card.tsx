import { Handle, Position } from "@xyflow/react";

import { css } from "@hashintel/ds-helpers/css";

import {
  nodeSurfaceStyle,
  type SelectionVariant,
} from "../../../styles/node-surface";
import { handleStyling } from "../../../styles/styling";

import type { ReactNode } from "react";

const containerStyle = css({
  position: "relative",
  height: "full",
});

/**
 * The compact card's own layout: an icon beside a title and subtitle. The
 * card's border, shadow and selection treatment come from
 * {@link nodeSurfaceStyle}, and consumers pass the shape and colours per node
 * type. The card fills the node wrapper, which React Flow sizes to the node's
 * declared dimensions (see `RenderNodeDimensions` in petrinaut-core).
 */
const cardLayoutStyle = css({
  borderStyle: "solid",
  borderWidth: "[1px]",
  shadow: "[0px 2px 9px rgba(0, 0, 0, 0.04)]",
  _hover: {
    shadow: "[0px 4px 11px rgba(0, 0, 0, 0.1)]",
  },
  // Covers the border, since the card is border-box.
  _after: {
    inset: "[-1px]",
  },
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  padding: "[4px 12px 4px 4px]",
});

export const iconContainerBaseStyle = css({
  width: "[40px]",
  height: "[40px]",
  backgroundColor: "neutral.s10",
  border: "[1px solid rgba(0,0,0,0.06)]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  fontSize: "2xl",
  color: "neutral.s80",
  position: "relative",
});

export const iconBadgeStyle = css({
  position: "absolute",
  bottom: "[-2px]",
  right: "[-2px]",
  fontSize: "xs",
  backgroundColor: "neutral.s00",
  borderRadius: "[50%]",
  width: "[16px]",
  height: "[16px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const textAreaStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "0",
  overflow: "hidden",
});

const titleStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1.2]",
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

interface NodeCardProps {
  /** How the node is drawn relative to the current selection */
  selection: SelectionVariant;
  /** Extra classes for the card, layered on the shared surface (e.g. shape) */
  cardClassName: string;
  /** Inline style overrides for the card (e.g. border/background colors) */
  cardStyle?: React.CSSProperties;
  /** Ref forwarded to the card div (used for firing animation) */
  cardRef?: React.Ref<HTMLDivElement>;
  /** The icon container element (with shape-specific border-radius) */
  iconContainer: ReactNode;
  /** Node display name */
  title: string;
  /** Secondary label (e.g. "Place", "Stochastic") */
  subtitle: string;
  /** Optional badge positioned absolutely on the card (e.g. token count, firing bolt) */
  badge?: ReactNode;
  /** Whether handles allow new connections */
  isConnectable: boolean;
}

export const NodeCard: React.FC<NodeCardProps> = ({
  selection,
  cardClassName,
  cardStyle,
  cardRef,
  iconContainer,
  title,
  subtitle,
  badge,
  isConnectable,
}) => {
  return (
    <div className={containerStyle}>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={handleStyling}
      />
      <div
        ref={cardRef}
        className={`${nodeSurfaceStyle({ selection })} ${cardLayoutStyle} ${cardClassName}`}
        style={cardStyle}
      >
        {iconContainer}
        <div className={textAreaStyle}>
          <div className={titleStyle}>{title}</div>
          <div className={subtitleStyle}>{subtitle}</div>
        </div>
        {badge}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={handleStyling}
      />
    </div>
  );
};
