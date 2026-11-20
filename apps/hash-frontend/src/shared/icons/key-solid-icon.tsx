import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const KeySolidIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon {...props} width="16" height="16" icon="key" />;
};
