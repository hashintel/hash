import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const GitLabIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path
      d="m23.55 13.35-1.39-4.27-2.73-8.4a.47.47 0 0 0-.9 0l-2.73 8.4H8.2L5.47.68a.47.47 0 0 0-.9 0L1.84 9.08.45 13.35a.94.94 0 0 0 .34 1.05L12 22.54l11.21-8.14a.94.94 0 0 0 .34-1.05z"
      fill="#E24329"
    />
    <path d="M12 22.54 16.8 9.08H7.2z" fill="#FC6D26" />
    <path d="m12 22.54-4.8-13.46H1.84L12 22.54z" fill="#FCA326" />
    <path
      d="M1.84 9.08.45 13.35a.94.94 0 0 0 .34 1.05L12 22.54 1.84 9.08z"
      fill="#E24329"
    />
    <path d="M1.84 9.08h5.36L4.57.68a.47.47 0 0 0-.9 0z" fill="#FC6D26" />
    <path d="m12 22.54 4.8-13.46h5.36L12 22.54z" fill="#FCA326" />
    <path
      d="m22.16 9.08 1.39 4.27a.94.94 0 0 1-.34 1.05L12 22.54l10.16-13.46z"
      fill="#E24329"
    />
    <path d="M22.16 9.08h-5.36l2.63-8.4a.47.47 0 0 1 .9 0z" fill="#FC6D26" />
  </SvgIcon>
);
