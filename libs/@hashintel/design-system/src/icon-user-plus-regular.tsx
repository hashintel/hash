import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const UserPlusRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon viewBox="0 0 640 512" fill="none" {...props}>
      <path d="M224 48a80 80 0 1 1 0 160 80 80 0 1 1 0-160zm0 208A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 96l91.4 0c65.7 0 120.1 48.7 129 112L49.3 464c8.9-63.3 63.3-112 129-112zm0-48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0zM504 312c0 13.3 10.7 24 24 24s24-10.7 24-24l0-64 64 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-64 0 0-64c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 64-64 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l64 0 0 64z" />
    </SvgIcon>
  );
};
