import type { SVGProps } from "react";

type PinIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
};

/**
 * A thumbtack, for holding a floating surface open.
 *
 * Drawn here rather than taken from the icon set, which has no pin.
 */
export const PinIcon = ({ size = 14, title, ...props }: PinIconProps) => (
  <svg
    aria-hidden={title === undefined ? true : undefined}
    fill="none"
    height={size}
    role={title === undefined ? undefined : "img"}
    viewBox="0 0 16 16"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {title && <title>{title}</title>}
    <path
      d="M5.5 2.5H10.5M6.5 2.5L5.5 9.5H10.5L9.5 2.5M8 9.5V13.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.4"
    />
  </svg>
);
