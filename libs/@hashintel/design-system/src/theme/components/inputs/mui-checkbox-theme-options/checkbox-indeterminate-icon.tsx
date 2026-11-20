import { HashSvgIcon } from "../../../../hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CheckboxIndeterminateIcon: FunctionComponent<SvgIconProps> = ({
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
      icon="squareMinus"
      variant="filled"
      ink="#0775E3"
    />
  );
};
