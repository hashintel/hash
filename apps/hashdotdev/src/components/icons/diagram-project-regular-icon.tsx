import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const DiagramProjectRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => (
  <SvgIcon {...props} viewBox="0 0 576 512">
    <path d="M136 80c4.4 0 8 3.6 8 8v80c0 4.4-3.6 8-8 8H56c-4.4 0-8-3.6-8-8V88c0-4.4 3.6-8 8-8h80zM56 32C25.1 32 0 57.1 0 88v80c0 30.9 25.1 56 56 56h80c5.6 0 11.1-.8 16.2-2.4l75.9 101.2c-2.7 6.5-4.1 13.7-4.1 21.2v80c0 30.9 25.1 56 56 56h80c30.9 0 56-25.1 56-56V344c0-30.9-25.1-56-56-56H280c-5.6 0-11.1 .8-16.2 2.4L187.9 189.2c2.7-6.5 4.1-13.7 4.1-21.2V152H384v16c0 30.9 25.1 56 56 56h80c30.9 0 56-25.1 56-56V88c0-30.9-25.1-56-56-56H440c-30.9 0-56 25.1-56 56v16H192V88c0-30.9-25.1-56-56-56H56zM360 336c4.4 0 8 3.6 8 8v80c0 4.4-3.6 8-8 8H280c-4.4 0-8-3.6-8-8V344c0-4.4 3.6-8 8-8h80zM440 80h80c4.4 0 8 3.6 8 8v80c0 4.4-3.6 8-8 8H440c-4.4 0-8-3.6-8-8V88c0-4.4 3.6-8 8-8z" />
  </SvgIcon>
);
