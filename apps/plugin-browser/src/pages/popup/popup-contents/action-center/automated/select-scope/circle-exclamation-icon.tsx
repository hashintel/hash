import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CircleExclamationIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return <HashSvgIcon width="16" height="15" {...props} icon="error" />;
};
