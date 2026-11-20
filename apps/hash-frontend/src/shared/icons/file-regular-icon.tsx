import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const FileRegularIcon: FunctionComponent<SvgIconProps> = (props) => (
  <HashSvgIcon {...props} icon="file" />
);
