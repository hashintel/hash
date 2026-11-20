import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const BarcodeIcon: FunctionComponent<SvgIconProps> = ({
  sx = [],
  ...props
}) => {
  return (
    <HashSvgIcon
      {...props}
      width="512"
      height="512"
      fill="none"
      sx={Array.isArray(sx) ? sx : [sx]}
      icon="barcode"
    />
  );
};
