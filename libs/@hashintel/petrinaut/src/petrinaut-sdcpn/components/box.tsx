import type { CSSProperties, ReactNode } from "react";

export interface BoxProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Box is a basic layout primitive that provides a flexible container.
 * Use className prop for custom styling via Panda CSS.
 */
export const Box: React.FC<BoxProps> = ({ children, className, style }) => {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
};
