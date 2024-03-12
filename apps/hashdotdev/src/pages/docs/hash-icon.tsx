import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const HashIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} width="46" height="46" viewBox="0 0 46 46">
    <g opacity="0.9">
      <path
        opacity="0.886277"
        d="M25.7905 46H38.5986V0H25.7905V46Z"
        fill="url(#paint0_linear_2142_9854)"
      />
      <path
        opacity="0.898345"
        d="M7.40149 46H20.2085V0H7.40149V46Z"
        fill="url(#paint1_linear_2142_9854)"
      />
      <path
        opacity="0.881278"
        d="M0 19.7162H46V6.9082H0V19.7162Z"
        fill="url(#paint2_linear_2142_9854)"
      />
      <path
        opacity="0.855632"
        d="M0 38.434H46V25.627H0V38.434Z"
        fill="url(#paint3_linear_2142_9854)"
      />
    </g>
    <defs>
      <linearGradient
        id="paint0_linear_2142_9854"
        x1="38.5986"
        y1="46"
        x2="38.5986"
        y2="0"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#00BBFF" />
        <stop offset="1" stopColor="#0046FF" />
      </linearGradient>
      <linearGradient
        id="paint1_linear_2142_9854"
        x1="7.40149"
        y1="0"
        x2="7.40149"
        y2="46"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#00B8FF" />
        <stop offset="1" stopColor="#0010FF" />
      </linearGradient>
      <linearGradient
        id="paint2_linear_2142_9854"
        x1="2.69394"
        y1="19.0803"
        x2="44.126"
        y2="19.0803"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#00AFFF" />
        <stop offset="1" stopColor="#5424FF" />
      </linearGradient>
      <linearGradient
        id="paint3_linear_2142_9854"
        x1="4.04945"
        y1="37.8703"
        x2="46"
        y2="37.8703"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#6D2BF6" />
        <stop offset="1" stopColor="#0080FF" />
      </linearGradient>
    </defs>
  </SvgIcon>
);
