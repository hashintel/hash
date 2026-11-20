import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const LinkIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon
      stroke="currentColor"
      width="18"
      height="18"
      fill="none"
      {...props}
      icon="link"
    />
  );
};
