import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const AsteriskRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 384 512" fill="none">
      <path d="M192 32c13.3 0 24 10.7 24 24V212.9l131.4-81.3c11.3-7 26.1-3.5 33 7.8s3.5 26.1-7.8 33L237.6 256l135 83.6c11.3 7 14.8 21.8 7.8 33s-21.8 14.7-33 7.8L216 299.1V456c0 13.3-10.7 24-24 24s-24-10.7-24-24V299.1L36.6 380.4c-11.3 7-26.1 3.5-33-7.8s-3.5-26.1 7.8-33l135-83.6-135-83.6c-11.3-7-14.8-21.8-7.8-33s21.8-14.8 33-7.8L168 212.9V56c0-13.3 10.7-24 24-24z" />
    </SvgIcon>
  );
};
