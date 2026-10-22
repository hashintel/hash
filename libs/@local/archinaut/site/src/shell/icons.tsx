/** The few icons the chrome draws, as inline SVG so they take the text colour. */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: string };

const Icon = ({ size = "1em", children, ...props }: IconProps) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    {children}
  </svg>
);

export const CaretIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14.83 11.29 10.59 7.05a1 1 0 0 0-1.42 0 1 1 0 0 0 0 1.41L12.71 12l-3.54 3.54a1 1 0 0 0 0 1.41 1 1 0 0 0 1.42 0l4.24-4.24a1 1 0 0 0 0-1.42Z" />
  </Icon>
);

export const BarsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 8h18a1 1 0 1 0 0-2H3a1 1 0 0 0 0 2Zm18 8H3a1 1 0 0 0 0 2h18a1 1 0 0 0 0-2Zm0-5H3a1 1 0 0 0 0 2h18a1 1 0 0 0 0-2Z" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13.41 12l5.3-5.29a1 1 0 0 0-1.42-1.42L12 10.59l-5.29-5.3a1 1 0 0 0-1.42 1.42l5.3 5.29-5.3 5.29a1 1 0 0 0 1.42 1.42l5.29-5.3 5.29 5.3a1 1 0 0 0 1.42-1.42Z" />
  </Icon>
);

export const MagnifierIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21.71 20.29 18 16.61A9 9 0 1 0 16.61 18l3.68 3.68a1 1 0 0 0 1.42 0 1 1 0 0 0 0-1.39ZM11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" />
  </Icon>
);

export const LaptopIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9H2v2h20v-2h-2ZM6 7h12v9H6V7Z" />
  </Icon>
);

export const MapIcon = (props: IconProps) => (
  <Icon {...props}>
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4" />
    </g>
  </Icon>
);
