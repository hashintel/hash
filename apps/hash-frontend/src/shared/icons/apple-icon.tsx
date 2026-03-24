import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const AppleIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path
      d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.53-3.23 0-1.44.62-2.2.44-3.06-.4C3.79 16.17 4.36 9.02 8.82 8.78c1.28.07 2.17.74 2.92.78.98-.2 1.92-.89 3-.81 1.51.12 2.63.71 3.36 1.78-3.07 1.87-2.34 5.98.44 7.13-.58 1.52-1.33 3.02-2.49 4.62zM12.03 8.7c-.15-2.34 1.81-4.29 4.01-4.48.3 2.65-2.38 4.63-4.01 4.48z"
      fill="currentColor"
    />
  </SvgIcon>
);
