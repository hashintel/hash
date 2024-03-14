import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const AsteriskLightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 384 512" fill="none">
      <path d="M192 32c8.8 0 16 7.2 16 16V226.9l151.4-96.4c7.5-4.7 17.3-2.5 22.1 4.9s2.5 17.3-4.9 22.1L221.8 256l154.8 98.5c7.5 4.7 9.7 14.6 4.9 22.1s-14.6 9.7-22.1 4.9L208 285.1V464c0 8.8-7.2 16-16 16s-16-7.2-16-16V285.1L24.6 381.5c-7.5 4.7-17.3 2.5-22.1-4.9s-2.5-17.3 4.9-22.1L162.2 256 7.4 157.5c-7.5-4.7-9.7-14.6-4.9-22.1s14.6-9.7 22.1-4.9L176 226.9V48c0-8.8 7.2-16 16-16z" />{" "}
    </SvgIcon>
  );
};
