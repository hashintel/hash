import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ClockRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon width="512" height="512" fill="none" {...props} icon="clock" />
  );
};
