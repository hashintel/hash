import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const TerminalLightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      width="576"
      height="512"
      viewBox="0 0 576 512"
      fill="none"
      {...props}
    >
      <path d="M5.1 59.7c-6.5-6-6.9-16.1-.8-22.6s16.1-6.9 22.6-.8l224 208c3.3 3 5.1 7.3 5.1 11.7s-1.9 8.7-5.1 11.7l-224 208c-6.5 6-16.6 5.6-22.6-.8s-5.6-16.6 .8-22.6L216.5 256 5.1 59.7zM240 448H560c8.8 0 16 7.2 16 16s-7.2 16-16 16H240c-8.8 0-16-7.2-16-16s7.2-16 16-16z" />
    </SvgIcon>
  );
};
