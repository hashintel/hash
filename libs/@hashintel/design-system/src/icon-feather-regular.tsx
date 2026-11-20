import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const FeatherRegularIcon: FunctionComponent<SvgIconProps> = (props) => (
  <HashSvgIcon {...props} height="16" width="16" icon="feather" />
);
