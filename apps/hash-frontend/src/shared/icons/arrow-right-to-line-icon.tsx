import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowRightToLineIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  const { sx = [], ...otherProps } = props;
  return (
    <HashSvgIcon
      fill="none"
      sx={[
        {
          width: "1em",
          height: "1em",
          fontSize: 20,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...otherProps}
      icon="rightToLine"
    />
  );
};
