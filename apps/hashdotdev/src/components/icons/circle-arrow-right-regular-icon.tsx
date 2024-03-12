import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const CircleArrowRightRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => (
  <SvgIcon {...props} viewBox="0 0 512 512">
    <path d="M464 256A208 208 0 1 1 48 256a208 208 0 1 1 416 0zM0 256a256 256 0 1 0 512 0A256 256 0 1 0 0 256zM289 361l88-88c9.4-9.4 9.4-24.6 0-33.9l-88-88c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l47 47L152 232c-13.3 0-24 10.7-24 24s10.7 24 24 24l150.1 0-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0z" />
  </SvgIcon>
);
