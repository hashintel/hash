import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const BrowserLightIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 512 512">
    <path d="M160 64v64H480V96c0-17.7-14.3-32-32-32H160zm-32 0H64C46.3 64 32 78.3 32 96v32h96V64zM32 160V416c0 17.7 14.3 32 32 32H448c17.7 0 32-14.3 32-32V160H144 32zM0 96C0 60.7 28.7 32 64 32H448c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96z" />
  </SvgIcon>
);
