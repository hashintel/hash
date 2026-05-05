import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const MicrosoftIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M3 3h8.5v8.5H3z" fill="#F25022" />
    <path d="M12.5 3H21v8.5h-8.5z" fill="#7FBA00" />
    <path d="M3 12.5h8.5V21H3z" fill="#00A4EF" />
    <path d="M12.5 12.5H21V21h-8.5z" fill="#FFB900" />
  </SvgIcon>
);
