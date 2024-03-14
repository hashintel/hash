import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const FeatherRegularIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} height="16" width="16" viewBox="0 0 512 512">
    <path
      fill="currentColor"
      d="M311.9 166.1L112 366.1l0-36c0-55.2 21.9-108.1 60.9-147.1L276.7 79.2c20-20 47.1-31.2 75.3-31.2s55.3 11.2 75.3 31.2l5.5 5.5c20 20 31.2 47.1 31.2 75.3c0 16.8-4 33.3-11.4 48H337.9l7.9-7.9c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0zm-22 89.9H412.1l-48 48H241.9l48-48zm24.9 96c-37.2 30.9-84.2 48-132.9 48h-36l48-48H314.9zM64 330v84L7 471c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l57-57h84c67.9 0 133-27 181-75L466.7 269.3c29-29 45.3-68.3 45.3-109.3s-16.3-80.3-45.3-109.3l-5.5-5.5C432.3 16.3 393 0 352 0s-80.3 16.3-109.3 45.3L139 149C91 197 64 262.1 64 330z"
    />
  </SvgIcon>
);
