import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ServerRegularIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 512 512">
    <path d="M64 80c-8.8 0-16 7.2-16 16v64c0 8.8 7.2 16 16 16H448c8.8 0 16-7.2 16-16V96c0-8.8-7.2-16-16-16H64zM0 96C0 60.7 28.7 32 64 32H448c35.3 0 64 28.7 64 64v64c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96zM64 336c-8.8 0-16 7.2-16 16v64c0 8.8 7.2 16 16 16H448c8.8 0 16-7.2 16-16V352c0-8.8-7.2-16-16-16H64zM0 352c0-35.3 28.7-64 64-64H448c35.3 0 64 28.7 64 64v64c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V352zm392 32a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm24-280a24 24 0 1 1 0 48 24 24 0 1 1 0-48zM328 384a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm24-280a24 24 0 1 1 0 48 24 24 0 1 1 0-48z" />
  </SvgIcon>
);
