import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const PlusIcon: FunctionComponent<SvgIconProps> = (props) => (
  <HashSvgIcon fill="currentColor" {...props} icon="plus" />
);
