import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowDownAZRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return <HashSvgIcon {...props} fill="none" icon="sortDownAlphabetical" />;
};
