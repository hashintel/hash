import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const ArrowsToLineRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon {...props} viewBox="0 0 448 512">
      <path d="M241 185l72-72c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-31 31L248 24c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 86.1L169 79c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l72 72c9.4 9.4 24.6 9.4 33.9 0zM0 256c0 13.3 10.7 24 24 24H424c13.3 0 24-10.7 24-24s-10.7-24-24-24H24c-13.3 0-24 10.7-24 24zm241 71c-9.4-9.4-24.6-9.4-33.9 0l-72 72c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l31-31V488c0 13.3 10.7 24 24 24s24-10.7 24-24V401.9l31 31c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-72-72z" />
    </SvgIcon>
  );
};
