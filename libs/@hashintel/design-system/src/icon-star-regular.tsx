import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const StarRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon fill="none" {...props} icon="star" />;
};
