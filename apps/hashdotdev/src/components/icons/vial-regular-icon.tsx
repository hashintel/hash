import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const VialRegularIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 512 512">
    <path d="M329 7c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l15 15L30.2 335.8C10.9 355.2 0 381.4 0 408.8C0 465.8 46.2 512 103.2 512c27.4 0 53.6-10.9 73-30.2L456 201.9l15 15c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-32-32L361 39 329 7zm-151 249L344 89.9 422.1 168l-88 88H177.9z" />
  </SvgIcon>
);
