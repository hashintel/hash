import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CanvasNewIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon width="18" height="12" fill="none" {...props} icon="canvas" />
  );
};
