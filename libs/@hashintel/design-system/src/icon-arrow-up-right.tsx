import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowUpRightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      width="384"
      height="512"
      viewBox="0 0 384 512"
      fill="none"
      {...props}
    >
      <path d="M352 128c0-17.7-14.3-32-32-32L96 96c-17.7 0-32 14.3-32 32s14.3 32 32 32l146.7 0L41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L288 205.3 288 352c0 17.7 14.3 32 32 32s32-14.3 32-32l0-224z" />
    </SvgIcon>
  );
};
