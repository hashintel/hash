import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const IconDiagramRegular: FunctionComponent<SvgIconProps> = ({
  sx = [],
  ...props
}) => {
  return (
    <SvgIcon
      {...props}
      width="576"
      height="512"
      viewBox="0 0 576 512"
      fill="none"
      sx={Array.isArray(sx) ? sx : [sx]}
    >
      <path d="M136 80c4.4 0 8 3.6 8 8l0 80c0 4.4-3.6 8-8 8l-80 0c-4.4 0-8-3.6-8-8l0-80c0-4.4 3.6-8 8-8l80 0zM56 32C25.1 32 0 57.1 0 88l0 80c0 30.9 25.1 56 56 56l80 0c5.6 0 11.1-.8 16.2-2.4l75.9 101.2c-2.7 6.5-4.1 13.7-4.1 21.2l0 80c0 30.9 25.1 56 56 56l80 0c30.9 0 56-25.1 56-56l0-80c0-30.9-25.1-56-56-56l-80 0c-5.6 0-11.1 .8-16.2 2.4L187.9 189.2c2.7-6.5 4.1-13.7 4.1-21.2l0-16 192 0 0 16c0 30.9 25.1 56 56 56l80 0c30.9 0 56-25.1 56-56l0-80c0-30.9-25.1-56-56-56l-80 0c-30.9 0-56 25.1-56 56l0 16-192 0 0-16c0-30.9-25.1-56-56-56L56 32zM360 336c4.4 0 8 3.6 8 8l0 80c0 4.4-3.6 8-8 8l-80 0c-4.4 0-8-3.6-8-8l0-80c0-4.4 3.6-8 8-8l80 0zM440 80l80 0c4.4 0 8 3.6 8 8l0 80c0 4.4-3.6 8-8 8l-80 0c-4.4 0-8-3.6-8-8l0-80c0-4.4 3.6-8 8-8z" />
    </SvgIcon>
  );
};
