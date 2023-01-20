import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const HashIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 31 30">
      <g opacity="0.9">
        <path
          opacity="0.886"
          d="M16.884 30h8.384V0h-8.384v30z"
          fill="url(#prefix__paint0_linear)"
        />
        <path
          opacity="0.898"
          d="M4.845 30h8.384V0H4.845v30z"
          fill="url(#prefix__paint1_linear)"
        />
        <path
          opacity="0.881"
          d="M0 12.858h30.114V4.505H0v8.353z"
          fill="url(#prefix__paint2_linear)"
        />
        <path
          opacity="0.856"
          d="M0 25.066h30.114v-8.353H0v8.353z"
          fill="url(#prefix__paint3_linear)"
        />
      </g>
      <defs>
        <linearGradient
          id="prefix__paint0_linear"
          x1="25.268"
          y1="30"
          x2="25.268"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0BF" />
          <stop offset="1" stopColor="#0046FF" />
        </linearGradient>
        <linearGradient
          id="prefix__paint1_linear"
          x1="4.845"
          y1="0"
          x2="4.845"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00B8FF" />
          <stop offset="1" stopColor="#0010FF" />
        </linearGradient>
        <linearGradient
          id="prefix__paint2_linear"
          x1="1.764"
          y1="12.443"
          x2="28.887"
          y2="12.443"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00AFFF" />
          <stop offset="1" stopColor="#5424FF" />
        </linearGradient>
        <linearGradient
          id="prefix__paint3_linear"
          x1="2.651"
          y1="24.698"
          x2="30.114"
          y2="24.698"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6D2BF6" />
          <stop offset="1" stopColor="#0080FF" />
        </linearGradient>
      </defs>
    </SvgIcon>
  );
};
