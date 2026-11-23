import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const PlugRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon
      stroke="currentColor"
      width="384"
      height="512"
      fill="none"
      {...props}
      icon="plug"
    />
  );
};
