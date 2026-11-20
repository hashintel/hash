import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const WarnIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon width="20" height="20" fill="none" {...props} icon="error" />
  );
};
