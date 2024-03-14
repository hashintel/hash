import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const Circle3RegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512">
      <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM184 128c-13.3 0-24 10.7-24 24s10.7 24 24 24h66.3l-50.5 46.3c-7.3 6.7-9.7 17.2-6.1 26.5s12.6 15.3 22.5 15.2l51.5-.3c20.1-.1 36.4 16.1 36.4 36.2c0 20-16.2 36.2-36.2 36.2H240c-13.5 0-26-7-33-18.4l-2.6-4.2c-7-11.3-21.8-14.8-33-7.8s-14.8 21.8-7.8 33l2.6 4.2C182 368.4 209.9 384 240 384h27.8c46.5 0 84.2-37.7 84.2-84.2c0-43.3-32.6-78.9-74.6-83.6l50.8-46.5c7.3-6.7 9.7-17.2 6.2-26.4s-12.5-15.3-22.4-15.3H184z" />
    </SvgIcon>
  );
};
