import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowUpRightRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <HashSvgIcon
      height="16"
      width="12"
      fill="none"
      {...props}
      icon="arrowUpRight"
    />
  );
};
