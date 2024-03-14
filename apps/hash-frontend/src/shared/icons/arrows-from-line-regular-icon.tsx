import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowsFromLineRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon {...props} viewBox="0 0 448 512">
      <path d="M241 7c-9.4-9.4-24.6-9.4-33.9 0L135 79c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l31-31V168c0 13.3 10.7 24 24 24s24-10.7 24-24V81.9l31 31c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9L241 7zm7 337c0-13.3-10.7-24-24-24s-24 10.7-24 24v86.1l-31-31c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l72 72c9.4 9.4 24.6 9.4 33.9 0l72-72c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-31 31V344zM24 232c-13.3 0-24 10.7-24 24s10.7 24 24 24H424c13.3 0 24-10.7 24-24s-10.7-24-24-24H24z" />
    </SvgIcon>
  );
};
