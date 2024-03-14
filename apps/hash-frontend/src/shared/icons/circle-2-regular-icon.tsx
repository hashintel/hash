import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const Circle2RegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512">
      <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM222.7 184.7c7.2-5.5 16.1-8.4 25.3-8.3l3.4 .1c20.3 .3 36.6 16.8 36.6 37.1c0 10.3-4.2 20.1-11.7 27.1L167.6 342.5c-7.2 6.7-9.5 17.2-5.9 26.3S174.2 384 184 384H328c13.3 0 24-10.7 24-24s-10.7-24-24-24H244.7l64.4-60.4C326.3 259.5 336 237 336 213.5c0-46.5-37.3-84.4-83.8-85.1l-3.4-.1c-19.9-.3-39.3 6.1-55.1 18.1l-24.2 18.4c-10.5 8-12.6 23.1-4.5 33.6s23.1 12.6 33.6 4.5l24.2-18.4z" />
    </SvgIcon>
  );
};
