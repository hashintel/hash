import { useId } from "react";

import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const LightbulbOnRainbowIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  const gradientId = useId();

  return (
    <HashSvgIcon
      width="18"
      height="15"
      fill="none"
      {...props}
      icon="lightbulbOn"
      ink={`url(#${gradientId}-paint0_linear_11634_5856)`}
    >
      <defs>
        <linearGradient
          id={`${gradientId}-paint0_linear_11634_5856`}
          x1="0"
          y1="1"
          x2="12.5"
          y2="14"
          gradientUnits="userSpaceOnUse"
          gradientTransform="scale(1.3333333333333333 1.6)"
        >
          <stop stopColor="#FC29B4" />
          <stop offset="0.197917" stopColor="#FF4042" />
          <stop offset="0.427083" stopColor="#FFCD1D" />
          <stop offset="0.598958" stopColor="#2BE48C" />
          <stop offset="0.776042" stopColor="#23C3E7" />
          <stop offset="1" stopColor="#2D36FD" />
        </linearGradient>
      </defs>
    </HashSvgIcon>
  );
};
