import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const CalendarsLightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} height="16" width="16" viewBox="0 0 512 512">
      <path
        fill="currentColor"
        d="M208 0c8.8 0 16 7.2 16 16V64H384V16c0-8.8 7.2-16 16-16s16 7.2 16 16V64h32c35.3 0 64 28.7 64 64v64V352c0 35.3-28.7 64-64 64H160c-35.3 0-64-28.7-64-64V192 128c0-35.3 28.7-64 64-64h32V16c0-8.8 7.2-16 16-16zM160 96c-17.7 0-32 14.3-32 32v32H480V128c0-17.7-14.3-32-32-32H160zm320 96H128V352c0 17.7 14.3 32 32 32H448c17.7 0 32-14.3 32-32V192zM32 208V384c0 53 43 96 96 96H368c8.8 0 16 7.2 16 16s-7.2 16-16 16H128C57.3 512 0 454.7 0 384V208c0-8.8 7.2-16 16-16s16 7.2 16 16z"
      />
    </SvgIcon>
  );
};
