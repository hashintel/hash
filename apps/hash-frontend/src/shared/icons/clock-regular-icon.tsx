import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ClockRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon {...props} icon="clock" />;
};
