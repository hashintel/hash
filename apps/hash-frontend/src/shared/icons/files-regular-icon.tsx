import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const FilesRegularIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 448 512">
    <path d="M160 368H384c8.8 0 16-7.2 16-16V128H352c-17.7 0-32-14.3-32-32V48H160c-8.8 0-16 7.2-16 16V352c0 8.8 7.2 16 16 16zm224 48H160c-35.3 0-64-28.7-64-64V64c0-35.3 28.7-64 64-64H325.5c17 0 33.3 6.7 45.3 18.7l58.5 58.5c12 12 18.7 28.3 18.7 45.3V352c0 35.3-28.7 64-64 64zM24 96c13.3 0 24 10.7 24 24V376c0 48.6 39.4 88 88 88H328c13.3 0 24 10.7 24 24s-10.7 24-24 24H136C60.9 512 0 451.1 0 376V120c0-13.3 10.7-24 24-24z" />{" "}
  </SvgIcon>
);
