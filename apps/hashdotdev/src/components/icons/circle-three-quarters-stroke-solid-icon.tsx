import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const CircleThreeQuartersStrokeSolidIcon: FunctionComponent<
  SvgIconProps
> = (props) => (
  <SvgIcon {...props} viewBox="0 0 512 512">
    <path d="M256 64V224c0 17.7 14.3 32 32 32H448c0-106-86-192-192-192zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z" />
  </SvgIcon>
);
