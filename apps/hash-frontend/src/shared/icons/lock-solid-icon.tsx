import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const LockSolidIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon {...props} icon="lockClosed" />;
};
