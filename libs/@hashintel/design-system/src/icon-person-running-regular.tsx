import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const PersonRunningRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return <HashSvgIcon height="16" width="14" {...props} icon="personRunning" />;
};
