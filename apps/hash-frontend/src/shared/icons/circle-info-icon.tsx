import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CircleInfoIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon {...props} width="512" height="512" fill="none" icon="info" />
  );
};
