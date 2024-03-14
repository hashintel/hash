import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowTurnDownLeftRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512" fill="none">
      <path d="M464 56c0-13.3 10.7-24 24-24s24 10.7 24 24V224c0 48.6-39.4 88-88 88H81.9l87 87c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0L7 305c-9.4-9.4-9.4-24.6 0-33.9L135 143c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-87 87H424c22.1 0 40-17.9 40-40V56z" />
    </SvgIcon>
  );
};
