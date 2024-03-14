import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const HashSolidIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} width="16" height="16" viewBox="0 0 18 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.96667 16H3.66667V13.1889H0.900002V8.88889H3.66667V6.96666H0.900002V2.66666H3.66667V0H7.96667V2.66666H9.88889V0H14.1889V2.66666H17.1V6.96666H14.1889V8.88889H17.1V13.1889H14.1889V16H9.88889V13.1889H7.96667V16ZM7.96667 8.88889H9.88889V6.96666H7.96667V8.88889Z"
        fill="currentColor"
      />
    </SvgIcon>
  );
};
