import { css, cx } from "@hashintel/ds-helpers/css";

import type { ReactNode, Ref } from "react";

interface StackProps {
  children?: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
  /** @default "column" */
  direction?: "row" | "column";
}

const stackStyle = css({ display: "flex" });

/** Arranges its children in a column or a row. */
export const Stack: React.FC<StackProps> = ({
  children,
  className,
  ref,
  direction = "column",
}) => (
  <div
    ref={ref}
    className={cx(stackStyle, className)}
    style={{ flexDirection: direction }}
  >
    {children}
  </div>
);
