import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const AsteriskLightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon {...props} fill="none" icon="asterisk" />;
};
