import { SvgIcon } from "@mui/material";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const MinusRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 448 512">
      <path d="M40 232H408c13.3 0 24 10.7 24 24s-10.7 24-24 24H40c-13.3 0-24-10.7-24-24s10.7-24 24-24z" />
    </SvgIcon>
  );
};
