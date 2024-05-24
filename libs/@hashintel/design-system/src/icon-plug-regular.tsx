import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const PlugIconRegular: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      stroke="currentColor"
      width="384"
      height="512"
      viewBox="0 0 384 512"
      fill="none"
      {...props}
    >
      <path d="M128 24c0-13.3-10.7-24-24-24S80 10.7 80 24v88h48V24zm176 0c0-13.3-10.7-24-24-24s-24 10.7-24 24v88h48V24zM24 144c-13.3 0-24 10.7-24 24s10.7 24 24 24h8v64c0 80.2 59 146.6 136 158.2V488c0 13.3 10.7 24 24 24s24-10.7 24-24V414.2c77-11.6 136-78 136-158.2V192h8c13.3 0 24-10.7 24-24s-10.7-24-24-24h-8H304 80 32 24zM192 368c-61.9 0-112-50.1-112-112V192H304v64c0 61.9-50.1 112-112 112z" />
    </SvgIcon>
  );
};
