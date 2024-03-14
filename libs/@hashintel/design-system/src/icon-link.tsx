import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const LinkIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      stroke="currentColor"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      {...props}
    >
      <path
        d="M10.1582 7.84185C9.54389 7.22778 8.71084 6.88281 7.84223 6.88281C6.97361 6.88281 6.14055 7.22778 5.52622 7.84185L3.20947 10.1578C2.59513 10.7722 2.25 11.6054 2.25 12.4742C2.25 13.343 2.59513 14.1763 3.20947 14.7906C3.82381 15.4049 4.65704 15.7501 5.52585 15.7501C6.39466 15.7501 7.22788 15.4049 7.84223 14.7906L9.00022 13.6326"
        fill="none"
        stroke="inherit"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.8418 10.1582C8.45613 10.7723 9.28918 11.1173 10.1578 11.1173C11.0264 11.1173 11.8595 10.7723 12.4738 10.1582L14.7905 7.84222C15.4049 7.22788 15.75 6.39466 15.75 5.52585C15.75 4.65704 15.4049 3.82381 14.7905 3.20947C14.1762 2.59513 13.343 2.25 12.4742 2.25C11.6054 2.25 10.7721 2.59513 10.1578 3.20947L8.9998 4.36747"
        fill="none"
        stroke="inherit"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
};
