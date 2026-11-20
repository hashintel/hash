import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const TerminalLightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon
      width="576"
      height="512"
      fill="none"
      {...props}
      icon="terminal"
    />
  );
};
