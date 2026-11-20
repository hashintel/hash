import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const MagnifyingGlassMinusLightIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return <HashSvgIcon height="512" width="512" {...props} icon="zoomOut" />;
};
