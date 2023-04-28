import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const ChevronRightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      width="320"
      height="512"
      viewBox="0 0 320 512"
      fill="none"
      {...props}
    >
      <path
        d="M297 239c9.4 9.4 9.4 24.6 0 33.9L105 465c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l175-175L71 81c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0L297 239z"
        fill="inherit"
      />
    </SvgIcon>
  );
};
