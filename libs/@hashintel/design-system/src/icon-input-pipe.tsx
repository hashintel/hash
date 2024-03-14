import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const InputPipeIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      stroke="currentColor"
      width="640"
      height="512"
      viewBox="0 0 640 512"
      fill="none"
      {...props}
    >
      <path d="M64 128V384H576V128H64zM0 128C0 92.7 28.7 64 64 64H576c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128zm144 56V328c0 13.3-10.7 24-24 24s-24-10.7-24-24V184c0-13.3 10.7-24 24-24s24 10.7 24 24z" />
    </SvgIcon>
  );
};
