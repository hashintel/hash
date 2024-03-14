import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowUpRightRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon
      height="16"
      width="12"
      viewBox="0 0 384 512"
      fill="none"
      {...props}
    >
      <path d="M328 96c13.3 0 24 10.7 24 24V360c0 13.3-10.7 24-24 24s-24-10.7-24-24V177.9L73 409c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l231-231H88c-13.3 0-24-10.7-24-24s10.7-24 24-24H328z" />
    </SvgIcon>
  );
};
