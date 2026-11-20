import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ChevronRightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon
      width="320"
      height="512"
      fill="none"
      {...props}
      icon="chevronRight"
      ink="inherit"
    />
  );
};
