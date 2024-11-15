import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const FontCaseRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 640 512" fill="none">
      <path d="M198.4 47.5C194.9 38.2 186 32 176 32s-18.9 6.2-22.4 15.5l-152 400c-4.7 12.4 1.5 26.3 13.9 31s26.3-1.5 31-13.9L83.1 368l185.8 0 36.7 96.5c4.7 12.4 18.6 18.6 31 13.9s18.6-18.6 13.9-31l-152-400zM250.7 320l-149.3 0L176 123.6 250.7 320zM616 160c-13.3 0-24 10.7-24 24l0 8.8c-22.1-20.4-51.6-32.8-84-32.8c-68.5 0-124 55.5-124 124l0 72c0 68.5 55.5 124 124 124c32.4 0 61.9-12.4 84-32.8l0 8.8c0 13.3 10.7 24 24 24s24-10.7 24-24l0-272c0-13.3-10.7-24-24-24zM432 284c0-42 34-76 76-76s76 34 76 76l0 72c0 42-34 76-76 76s-76-34-76-76l0-72z" />
    </SvgIcon>
  );
};
