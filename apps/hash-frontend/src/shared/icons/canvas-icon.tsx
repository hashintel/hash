import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CanvasIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon width="16" height="12" fill="none" {...props} icon="canvas" />
  );
};
