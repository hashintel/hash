import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const StopSolidIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon {...props} width="384" height="512" fill="none" icon="stop" />
  );
};
