import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const WindLightIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 512 512">
    <path d="M288 16c0 8.8 7.2 16 16 16h64c26.5 0 48 21.5 48 48s-21.5 48-48 48H16c-8.8 0-16 7.2-16 16s7.2 16 16 16H368c44.2 0 80-35.8 80-80s-35.8-80-80-80H304c-8.8 0-16 7.2-16 16zm64 384c0 8.8 7.2 16 16 16h56c48.6 0 88-39.4 88-88s-39.4-88-88-88H16c-8.8 0-16 7.2-16 16s7.2 16 16 16H424c30.9 0 56 25.1 56 56s-25.1 56-56 56H368c-8.8 0-16 7.2-16 16zM112 512h64c44.2 0 80-35.8 80-80s-35.8-80-80-80H16c-8.8 0-16 7.2-16 16s7.2 16 16 16H176c26.5 0 48 21.5 48 48s-21.5 48-48 48H112c-8.8 0-16 7.2-16 16s7.2 16 16 16z" />
  </SvgIcon>
);
