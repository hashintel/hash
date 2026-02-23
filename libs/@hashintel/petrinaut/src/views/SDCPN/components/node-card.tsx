import { css, cva } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
import { Handle, Position } from "reactflow";

import { handleStyling } from "../styles/styling";

export type SelectionVariant = "resource" | "reactflow" | "none";

const containerStyle = css({
  position: "relative",
});

/**
 * Shared card style with selection variants.
 * Consumers pass `borderRadius` and color overrides per node type.
 */
export const nodeCardStyle = cva({
  base: {
    width: "[180px]",
    display: "flex",
    alignItems: "center",
    gap: "[8px]",
    padding: "[4px 12px 4px 4px]",
    border: "1px solid",
    boxSizing: "border-box",
    position: "relative",
    cursor: "default",
    transition: "[all 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    _hover: {
      outline: "[4px solid rgba(75, 126, 156, 0.2)]",
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

export const iconContainerBaseStyle = css({
  width: "[40px]",
  height: "[40px]",
  backgroundColor: "[#f9f9f9]",
  border: "[1px solid rgba(0,0,0,0.06)]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  fontSize: "[24px]",
  color: "neutral.s80",
  position: "relative",
});

export const iconBadgeStyle = css({
  position: "absolute",
  bottom: "[-2px]",
  right: "[-2px]",
  fontSize: "[12px]",
  backgroundColor: "[white]",
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
  fontSize: "[14px]",
  fontWeight: "medium",
  lineHeight: "[1.2]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const subtitleStyle = css({
  fontSize: "[12px]",
  color: "neutral.a90",
  lineHeight: "[1.2]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

interface NodeCardProps {
  /** Class name for the outer card (use nodeCardStyle with selection variant) */
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
      <div ref={cardRef} className={cardClassName} style={cardStyle}>
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
