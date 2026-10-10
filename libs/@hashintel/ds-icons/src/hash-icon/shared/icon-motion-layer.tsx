import type { PropsWithChildren } from "react";

export const IconMotionLayer = ({
  name,
  origin = "12px 12px",
  children,
}: PropsWithChildren<{ name: string; origin?: string }>) => (
  <g data-icon-layer={name}>
    <g data-icon-effect="bounce" style={{ transformOrigin: origin }}>
      <g data-icon-effect="pulse">
        <g data-icon-effect="rotate" style={{ transformOrigin: origin }}>
          {children}
        </g>
      </g>
    </g>
  </g>
);
