import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const GlobePointerIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon width="15" height="15" {...props} icon="globePointer" />;
};
