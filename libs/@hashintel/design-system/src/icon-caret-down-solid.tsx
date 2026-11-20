import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CaretDownSolidIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon width="320" height="512" {...props} icon="caretDown" />;
};
