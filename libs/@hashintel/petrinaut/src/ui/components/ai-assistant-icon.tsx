import type { SVGProps } from "react";

type AiAssistantIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
};

export const AiAssistantIcon = ({
  size = 15,
  title,
  ...props
}: AiAssistantIconProps) => (
  <svg
    aria-hidden={title === undefined ? true : undefined}
    fill="none"
    height={size}
    role={title === undefined ? undefined : "img"}
    viewBox="0 0 15 15"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {title && <title>{title}</title>}
    <path
      d="M7.25006 0.75L4.75 3.25006L7.25006 5.75013L9.75013 3.25006L7.25006 0.75Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
    <path
      d="M7.25003 8.75061L4.74997 11.2507L7.25003 13.7507L9.7501 11.2507L7.25003 8.75061Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
    <path
      d="M11.25 4.75L8.74997 7.25006L11.25 9.75013L13.7501 7.25006L11.25 4.75Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
    <path
      d="M3.25006 4.75061L0.75 7.25067L3.25006 9.75074L5.75013 7.25067L3.25006 4.75061Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);
