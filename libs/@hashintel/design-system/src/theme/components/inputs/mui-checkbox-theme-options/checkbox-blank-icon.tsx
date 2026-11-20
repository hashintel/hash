import { HashSvgIcon } from "../../../../hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CheckboxBlankIcon: FunctionComponent<SvgIconProps> = ({
  sx = [],
  ...otherProps
}) => {
  return (
    <HashSvgIcon
      {...otherProps}
      sx={[
        {
          width: "1em",
          height: "1em",
          fontSize: 16,
          fill: "none",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      fill="none"
      icon="transition"
    />
  );
};
