import { SvgIcon } from "@mui/material";
import { useId } from "react";

import { HashIconArtwork } from "@hashintel/ds-icons/static";

import type { HashIconName, HashIconVariant } from "@hashintel/ds-icons/static";
import type { SvgIconProps } from "@mui/material";

export type HashIconDefinition = { icon: HashIconName };
export type HashSvgIconProps = SvgIconProps & {
  icon: HashIconName | HashIconDefinition;
  variant?: HashIconVariant;
  weight?: number;
  ink?: string;
};

export const HashSvgIcon = ({
  icon,
  variant = "outline",
  weight = 400,
  children,
  ink,
  strokeWidth,
  classes,
  ...props
}: HashSvgIconProps) => {
  const id = useId();
  const name = typeof icon === "string" ? icon : icon.icon;
  return (
    <SvgIcon
      {...props}
      classes={{ ...classes, root: `HashSvgIcon ${classes?.root ?? ""}` }}
      viewBox="0 0 24 24"
    >
      <defs>
        <mask
          id={id}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
          style={{ maskType: "alpha" }}
        >
          <g style={{ color: "white" }}>
            <HashIconArtwork
              name={name}
              variant={variant}
              weight={weight}
              strokeWidth={strokeWidth}
            />
          </g>
        </mask>
      </defs>
      <rect
        width="24"
        height="24"
        stroke="none"
        style={{ fill: ink }}
        mask={`url(#${id})`}
      />
      {children}
    </SvgIcon>
  );
};

export type HashInlineIconProps = HashSvgIconProps;

export const HashInlineIcon = ({ sx = [], ...props }: HashInlineIconProps) => (
  <HashSvgIcon
    sx={[
      { color: "currentColor", width: "1em", height: "1em", fontSize: "16px" },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  />
);
