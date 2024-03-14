import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const DisplayChartUpLightIcon: FunctionComponent<SvgIconProps> = (
  props,
) => (
  <SvgIcon {...props} viewBox="0 0 576 512">
    <path d="M512 32c17.7 0 32 14.3 32 32V352c0 17.7-14.3 32-32 32H344.3c-.2 0-.4 0-.6 0H232.3c-.2 0-.4 0-.6 0H64c-17.7 0-32-14.3-32-32V64c0-17.7 14.3-32 32-32H512zM64 416H213.1l-10.7 64H144c-8.8 0-16 7.2-16 16s7.2 16 16 16h72H360h72c8.8 0 16-7.2 16-16s-7.2-16-16-16H373.6l-10.7-64H512c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H64C28.7 0 0 28.7 0 64V352c0 35.3 28.7 64 64 64zm170.9 64l10.7-64h84.9l10.7 64H234.9zM368 96c-8.8 0-16 7.2-16 16s7.2 16 16 16h57.4L304 249.4l-68.7-68.7c-6.2-6.2-16.4-6.2-22.6 0l-112 112c-6.2 6.2-6.2 16.4 0 22.6s16.4 6.2 22.6 0L224 214.6l68.7 68.7c3 3 7.1 4.7 11.3 4.7s8.3-1.7 11.3-4.7L448 150.6V208c0 8.8 7.2 16 16 16s16-7.2 16-16V112c0-8.8-7.2-16-16-16H368z" />
  </SvgIcon>
);
