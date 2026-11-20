import { HashSvgIcon } from "../../../../hash-svg-icon";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const RadioUncheckedIcon: FunctionComponent<SvgIconProps> = ({
  sx = [],
  ...otherProps
}) => {
  return (
    <HashSvgIcon
      {...otherProps}
      sx={[
        ({ palette }) => ({
          width: "1em",
          height: "1em",
          fontSize: 16,
          color: palette.gray[40],
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      fill="none"
      icon="place"
    />
  );
};
