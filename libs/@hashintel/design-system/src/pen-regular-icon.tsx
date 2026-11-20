import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const PenRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon {...props} fill="none" icon="pencil" />;
};
