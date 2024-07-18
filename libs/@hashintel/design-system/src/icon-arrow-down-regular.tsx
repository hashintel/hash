import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowDownIconRegular: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon
      {...props}
      width="384"
      height="512"
      viewBox="0 0 384 512"
      fill="none"
    >
      <path d="M175 461.8l17 17 17-17L362.6 308.2l17-17-33.9-33.9-17 17L216 386.9 216 56l0-24-48 0 0 24 0 330.8L55.4 274.2l-17-17L4.5 291.2l17 17L175 461.8z" />
    </SvgIcon>
  );
};
