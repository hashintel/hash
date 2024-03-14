import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const CircleHalfStrokeRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => (
  <SvgIcon {...props} viewBox="0 0 512 512">
    <path d="M464 256c0-114.9-93.1-208-208-208V464c114.9 0 208-93.1 208-208zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z" />
  </SvgIcon>
);
