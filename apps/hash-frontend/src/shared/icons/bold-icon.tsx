import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const BoldIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      {...props}
      width="384"
      height="512"
      viewBox="0 0 384 512"
      fill="none"
    >
      <path d="M303.8 241.7c2.084-1.838 4.41-3.307 6.385-5.303c22.72-22.91 35.03-53.31 34.72-85.59C344.3 85.31 290.4 32 224.9 32H24C10.75 32 0 42.75 0 56S10.75 80 24 80H48v352H24C10.75 432 0 442.8 0 456S10.75 480 24 480h216c70.59 0 128-57.41 128-128C368 304.8 341.1 263.9 303.8 241.7zM224.9 80c39.31 0 71.59 32 72 71.31c.1875 19.34-7.219 37.56-20.84 51.34C262.5 216.4 244.3 224 224.9 224H96V80H224.9zM240 432H96v-160h144c44.13 0 80 35.88 80 80.01S284.1 432 240 432z" />
    </SvgIcon>
  );
};
