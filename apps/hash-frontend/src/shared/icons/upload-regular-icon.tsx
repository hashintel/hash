import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const UploadRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      {...props}
      width="576"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
    >
      <path d="M280 360c0 13.3-10.7 24-24 24s-24-10.7-24-24V81.9l-95 95c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9L239 7c9.4-9.4 24.6-9.4 33.9 0L409 143c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-95-95V360zm32-8V304H448c35.3 0 64 28.7 64 64v80c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V368c0-35.3 28.7-64 64-64H200v48H64c-8.8 0-16 7.2-16 16v80c0 8.8 7.2 16 16 16H448c8.8 0 16-7.2 16-16V368c0-8.8-7.2-16-16-16H312zm72 56a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z" />
    </SvgIcon>
  );
};
