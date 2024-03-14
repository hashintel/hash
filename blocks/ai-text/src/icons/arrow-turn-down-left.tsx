import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowTurnDownLeftIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon
      width="512"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
      {...props}
    >
      <path d="M135 432.1l-128-128C2.344 300.3 0 294.2 0 288s2.344-12.28 7.031-16.97l128-128c9.375-9.375 24.56-9.375 33.94 0s9.375 24.56 0 33.94L81.94 264H464v-208C464 42.75 474.8 32 488 32S512 42.75 512 56V288c0 13.25-10.75 24-24 24H81.94l87.03 87.03c9.375 9.375 9.375 24.56 0 33.94S144.4 442.3 135 432.1z" />
    </SvgIcon>
  );
};
