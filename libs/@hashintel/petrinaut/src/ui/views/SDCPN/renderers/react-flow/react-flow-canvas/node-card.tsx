import {
  nodeContainerStyle,
  nodeSubtitleStyle,
  nodeTextAreaStyle,
  nodeTitleStyle,
} from "./node-card-styles";

import type { ReactNode } from "react";

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
  /** The node's handles, laid over the card */
  children: ReactNode;
}

export const NodeCard: React.FC<NodeCardProps> = ({
  cardClassName,
  cardStyle,
  cardRef,
  iconContainer,
  title,
  subtitle,
  badge,
  children,
}) => {
  return (
    <div className={nodeContainerStyle}>
      <div ref={cardRef} className={cardClassName} style={cardStyle}>
        {iconContainer}
        <div className={nodeTextAreaStyle}>
          <div className={nodeTitleStyle}>{title}</div>
          <div className={nodeSubtitleStyle}>{subtitle}</div>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
};
