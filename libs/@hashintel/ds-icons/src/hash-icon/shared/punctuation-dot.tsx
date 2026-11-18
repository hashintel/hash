import type { SVGProps } from "react";

export const PunctuationDot = ({
  x,
  y,
  ...props
}: Omit<SVGProps<SVGPathElement>, "x" | "y"> & { x: number; y: number }) => (
  <path
    d={`M${x} ${y}h.01`}
    fill="none"
    stroke="currentColor"
    strokeWidth="var(--hash-icon-dot-size)"
    strokeLinecap="square"
    {...props}
  />
);
