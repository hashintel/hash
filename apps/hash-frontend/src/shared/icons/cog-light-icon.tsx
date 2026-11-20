import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CogLightIcon: FunctionComponent<SvgIconProps> = (props) => (
  <HashSvgIcon {...props} icon="settings" />
);
