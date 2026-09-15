import { css } from "@hashintel/ds-helpers/css";

import { NodeHandles } from "./shared/node-handles";

import type { ReactNode } from "react";

const containerStyle = css({
  position: "relative",
  height: "full",
});

/**
 * Shared card style. Consumers pass `borderRadius` and color overrides per
 * node type, and compose `nodeFocusStyle` for the focus ring. The card fills
 * the node wrapper, which React Flow sizes to the node's declared dimensions
 * (see `RenderNodeDimensions` in petrinaut-core).
 */
export const nodeCardStyle = css({
  width: "full",
  height: "full",
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  padding: "[4px 12px 4px 4px]",
  border: "1px solid",
  boxSizing: "border-box",
  position: "relative",
  cursor: "default",
  // Contributed to the shadow `nodeFocusStyle` owns, so the focus glow
  // and the elevation can sit in one declaration.
  "--node-elevation": "0px 2px 9px rgba(0, 0, 0, 0.04)",
  // The pointer gets its own feedback straight away; only the neighbourhood
  // highlight waits for the hover to settle.
  _hover: { "--node-elevation": "0px 4px 11px rgba(0, 0, 0, 0.1)" },
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
  /** Class name for the outer card (nodeCardStyle plus the node's own styles) */
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
      <div ref={cardRef} className={cardClassName} style={cardStyle}>
        {iconContainer}
        <div className={textAreaStyle}>
          <div className={titleStyle}>{title}</div>
          <div className={subtitleStyle}>{subtitle}</div>
        </div>
        {badge}
      </div>
      <NodeHandles isConnectable={isConnectable} />
    </div>
  );
};
