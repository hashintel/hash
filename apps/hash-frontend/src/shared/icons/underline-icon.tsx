import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const UnderlineIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      {...props}
      width="448"
      height="512"
      viewBox="0 0 448 512"
      fill="none"
    >
      <path d="M40 48H64v192c0 88.22 71.78 160 160 160s160-71.78 160-160v-192h24c13.25 0 24-10.75 24-24S421.3 0 408 0h-96C298.8 0 288 10.75 288 24s10.75 24 24 24h24v192c0 61.75-50.25 112-112 112S112 301.8 112 240v-192h24C149.3 48 160 37.25 160 24S149.3 0 136 0h-96C26.75 0 16 10.75 16 24S26.75 48 40 48zM424 464H24C10.75 464 0 474.8 0 488S10.75 512 24 512h400c13.25 0 24-10.75 24-24S437.3 464 424 464z" />
    </SvgIcon>
  );
};
