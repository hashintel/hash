import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const AsteriskRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon fill="currentColor" {...props} icon="asterisk" />;
};
