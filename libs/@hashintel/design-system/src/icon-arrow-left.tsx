import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowLeftIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon
      width="448"
      height="512"
      fill="none"
      {...props}
      icon="arrowLeft"
    />
  );
};
