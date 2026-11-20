import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const MagnifyingGlassRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return <HashSvgIcon height="16" width="16" {...props} icon="search" />;
};
