import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowUpWideShortLightIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon
      width="576"
      height="512"
      viewBox="0 0 576 512"
      fill="none"
      {...props}
    >
      <path d="M139.3 36.7c-6.2-6.2-16.4-6.2-22.6 0l-96 96c-6.2 6.2-6.2 16.4 0 22.6s16.4 6.2 22.6 0L112 86.6V464c0 8.8 7.2 16 16 16s16-7.2 16-16V86.6l68.7 68.7c6.2 6.2 16.4 6.2 22.6 0s6.2-16.4 0-22.6l-96-96zM304 464h64c8.8 0 16-7.2 16-16s-7.2-16-16-16H304c-8.8 0-16 7.2-16 16s7.2 16 16 16zm0-128H432c8.8 0 16-7.2 16-16s-7.2-16-16-16H304c-8.8 0-16 7.2-16 16s7.2 16 16 16zm0-128H496c8.8 0 16-7.2 16-16s-7.2-16-16-16H304c-8.8 0-16 7.2-16 16s7.2 16 16 16zm0-128H560c8.8 0 16-7.2 16-16s-7.2-16-16-16H304c-8.8 0-16 7.2-16 16s7.2 16 16 16z" />
    </SvgIcon>
  );
};
