import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const XTwitterIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      width="18"
      height="16"
      viewBox="0 0 18 16"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M13.6758 0.9375H16.1367L10.7227 7.16016L17.1211 15.5625H12.1289L8.19141 10.4648L3.72656 15.5625H1.23047L7.03125 8.95312L0.914062 0.9375H6.04688L9.5625 5.61328L13.6758 0.9375ZM12.7969 14.0859H14.168L5.30859 2.34375H3.83203L12.7969 14.0859Z" />
    </SvgIcon>
  );
};
