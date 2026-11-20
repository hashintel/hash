import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const InputPipeRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <HashSvgIcon
      width="16"
      height="20"
      fill="none"
      {...props}
      icon="inputPipe"
    />
  );
};
