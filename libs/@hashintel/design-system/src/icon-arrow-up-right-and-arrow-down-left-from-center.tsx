import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowUpRightAndArrowDownLeftFromCenterIcon: FunctionComponent<
  SvgIconProps
> = ({ sx, ...props }) => (
  <HashSvgIcon {...props} sx={sx} icon="expandDiagonal" />
);
