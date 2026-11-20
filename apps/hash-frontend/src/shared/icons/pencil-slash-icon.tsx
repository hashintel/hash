import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const PencilSlashIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon
      {...props}
      width="640"
      height="512"
      fill="none"
      icon="pencilSlash"
    />
  );
};
