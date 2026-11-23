import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const EllipsisRegularIcon: FunctionComponent<SvgIconProps> = (props) => (
  <HashSvgIcon {...props} fill="currentColor" icon="ellipsis" />
);
