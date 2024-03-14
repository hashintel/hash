import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const SearchIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} width="17" height="16" viewBox="0 0 17 16" fill="none">
      <path
        d="M15.9736 14.7188L11.7861 10.5312C12.6924 9.4375 13.1924 8.03125 13.1924 6.5C13.1924 2.9375 10.2549 0 6.69238 0C3.09863 0 0.223633 2.9375 0.223633 6.5C0.223633 10.0938 3.12988 13 6.69238 13C8.19238 13 9.59863 12.5 10.7236 11.5938L14.9111 15.7812C15.0674 15.9375 15.2549 16 15.4736 16C15.6611 16 15.8486 15.9375 15.9736 15.7812C16.2861 15.5 16.2861 15.0312 15.9736 14.7188ZM1.72363 6.5C1.72363 3.75 3.94238 1.5 6.72363 1.5C9.47363 1.5 11.7236 3.75 11.7236 6.5C11.7236 9.28125 9.47363 11.5 6.72363 11.5C3.94238 11.5 1.72363 9.28125 1.72363 6.5Z"
        fill="#91A5BA"
      />
    </SvgIcon>
  );
};
