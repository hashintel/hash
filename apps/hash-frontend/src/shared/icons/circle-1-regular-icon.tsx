import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const Circle1RegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512">
      <path d="M464 256A208 208 0 1 0 48 256a208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zM268 131.2c7.4 4.3 12 12.2 12 20.8V336h40c13.3 0 24 10.7 24 24s-10.7 24-24 24H256 192c-13.3 0-24-10.7-24-24s10.7-24 24-24h40V193.4l-20.1 11.5c-11.5 6.6-26.2 2.6-32.7-8.9s-2.6-26.2 8.9-32.7l56-32c7.4-4.2 16.6-4.2 24 .1z" />
    </SvgIcon>
  );
};
