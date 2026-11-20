import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const IconDiagramNestedLight: FunctionComponent<SvgIconProps> = ({
  sx = [],
  ...props
}) => {
  return (
    <HashSvgIcon
      {...props}
      width="448"
      height="512"
      fill="none"
      sx={Array.isArray(sx) ? sx : [sx]}
      icon="diagramNested"
    />
  );
};
