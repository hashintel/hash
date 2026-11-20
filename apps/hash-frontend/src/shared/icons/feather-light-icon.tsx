import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const FeatherLightIcon: FunctionComponent<SvgIconProps> = (props) => (
  <HashSvgIcon {...props} height="16" width="16" icon="feather" />
);
