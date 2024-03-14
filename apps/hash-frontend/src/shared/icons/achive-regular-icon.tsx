import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArchiveRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512" fill="none">
      <path d="M48 80v48H464V80H48zM32 32H480c17.7 0 32 14.3 32 32v80c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V64C0 46.3 14.3 32 32 32zM160 248c0-13.3 10.7-24 24-24H328c13.3 0 24 10.7 24 24s-10.7 24-24 24H184c-13.3 0-24-10.7-24-24zM32 416V208H80V416c0 8.8 7.2 16 16 16H416c8.8 0 16-7.2 16-16V208h48V416c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64z" />
    </SvgIcon>
  );
};
