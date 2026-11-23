import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const FilesLightIcon: FunctionComponent<SvgIconProps> = (props) => (
  <HashSvgIcon {...props} fill="none" icon="files" />
);
