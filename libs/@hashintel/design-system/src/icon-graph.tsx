import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const GraphIcon: FunctionComponent<SvgIconProps> = ({
  sx = [],
  ...props
}) => {
  return (
    <HashSvgIcon
      {...props}
      width="26"
      height="22"
      fill="none"
      sx={[{ fill: "none !important" }, ...(Array.isArray(sx) ? sx : [sx])]}
      icon="chartNetwork"
    />
  );
};
