import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const LockRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 448 512">
      <path d="M144 128v64H304V128c0-44.2-35.8-80-80-80s-80 35.8-80 80zM96 192V128C96 57.3 153.3 0 224 0s128 57.3 128 128v64h32c35.3 0 64 28.7 64 64V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V256c0-35.3 28.7-64 64-64H96zM48 256V448c0 8.8 7.2 16 16 16H384c8.8 0 16-7.2 16-16V256c0-8.8-7.2-16-16-16H64c-8.8 0-16 7.2-16 16z" />
    </SvgIcon>
  );
};
