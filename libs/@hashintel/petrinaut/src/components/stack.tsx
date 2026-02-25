import { css } from "@hashintel/ds-helpers/css";
import type { CSSProperties, ReactNode, Ref } from "react";

export interface StackProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  /**
   * The direction to stack items
   * @default "column"
   */
  direction?: "row" | "column" | "row-reverse" | "column-reverse";
  /**
   * The gap between stack items
   */
  gap?: string | number;
  /**
   * Align items on the cross axis
   */
  align?: CSSProperties["alignItems"];
  /**
   * Justify content on the main axis
   */
  justify?: CSSProperties["justifyContent"];
}

/**
 * Stack is a layout primitive that arranges children in a vertical or horizontal stack.
 * Built following Panda CSS patterns for flexible layouts.
 */
export const Stack: React.FC<StackProps> = ({
  children,
  className,
  style,
  ref,
  direction = "column",
  gap,
  align,
  justify,
}) => {
  const baseClassName = css({
    display: "flex",
  });

  const combinedClassName = className
    ? `${baseClassName} ${className}`
    : baseClassName;

  const inlineStyle: CSSProperties = {
    flexDirection: direction,
    ...(gap !== undefined && {
      gap: typeof gap === "number" ? `${gap}px` : gap,
    }),
    ...(align && { alignItems: align }),
    ...(justify && { justifyContent: justify }),
    ...style,
  };

  return (
    <div ref={ref} className={combinedClassName} style={inlineStyle}>
      {children}
    </div>
  );
};
