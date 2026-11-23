import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const EyeSolidIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => {
  return (
    <HashSvgIcon
      width="576"
      height="512"
      fill="none"
      {...props}
      sx={Array.isArray(sx) ? sx : [sx]}
      icon="eye"
    />
  );
};
