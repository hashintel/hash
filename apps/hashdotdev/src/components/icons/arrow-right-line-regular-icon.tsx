import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowRightLineRegularIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => (
  <SvgIcon {...props} viewBox="0 0 448 512" sx={sx}>
    <path d="M448 88c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 336c0 13.3 10.7 24 24 24s24-10.7 24-24l0-336zM312.4 273.5c4.8-4.5 7.6-10.9 7.6-17.5s-2.7-12.9-7.6-17.5l-136-128c-9.7-9.1-24.8-8.6-33.9 1s-8.6 24.8 1 33.9L235.5 232 152 232 24 232c-13.3 0-24 10.7-24 24s10.7 24 24 24l128 0 83.5 0-91.9 86.5c-9.7 9.1-10.1 24.3-1 33.9s24.3 10.1 33.9 1l136-128z" />{" "}
  </SvgIcon>
);
