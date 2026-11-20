import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ChartNetworkRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return <HashSvgIcon {...props} fill="none" icon="chartNetwork" />;
};
