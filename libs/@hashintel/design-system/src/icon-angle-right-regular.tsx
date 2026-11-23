import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const AngleRightRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <HashSvgIcon
      stroke="currentColor"
      width="640"
      height="512"
      fill="none"
      {...props}
      icon="chevronRight"
    />
  );
};
