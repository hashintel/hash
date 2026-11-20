import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowTurnDownRightIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => {
  return (
    <HashSvgIcon
      width="512"
      height="512"
      fill="none"
      {...props}
      sx={[
        ({ palette }) => ({ fill: palette.gray[70], fontSize: 12 }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      icon="arrowTurnDownRight"
    />
  );
};
