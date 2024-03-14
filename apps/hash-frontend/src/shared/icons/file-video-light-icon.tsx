import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const FileVideoLightIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 384 512">
    <path d="M320 480H64c-17.7 0-32-14.3-32-32V64c0-17.7 14.3-32 32-32H192V144c0 26.5 21.5 48 48 48H352V448c0 17.7-14.3 32-32 32zM240 160c-8.8 0-16-7.2-16-16V32.5c2.8 .7 5.4 2.1 7.4 4.2L347.3 152.6c2.1 2.1 3.5 4.6 4.2 7.4H240zM64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V163.9c0-12.7-5.1-24.9-14.1-33.9L254.1 14.1c-9-9-21.2-14.1-33.9-14.1H64zM208 288v24 48 24H96V288H208zm32 96v-.4l58.1 23.2c4.9 2 10.5 1.4 14.9-1.6s7-7.9 7-13.2V280c0-5.3-2.6-10.3-7-13.2s-10-3.6-14.9-1.6L240 288.4V288c0-17.7-14.3-32-32-32H96c-17.7 0-32 14.3-32 32v96c0 17.7 14.3 32 32 32H208c17.7 0 32-14.3 32-32zm48-15.6l-48-19.2V322.8l48-19.2v64.7z" />
  </SvgIcon>
);
