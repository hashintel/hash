import { HashSvgIcon } from "./hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CloseIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => {
  return (
    <HashSvgIcon
      width="12"
      height="12"
      fill="none"
      {...props}
      sx={[
        ({ palette }) => ({ fill: palette.gray[50], fontSize: 12 }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      icon="close"
    />
  );
};
