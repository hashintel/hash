import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const UpFromLineIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => (
  <SvgIcon {...props} viewBox="0 0 384 512" sx={sx}>
    <path d="M82.2 192L192 82 301.8 192H248c-13.3 0-24 10.7-24 24V336H160V216c0-13.3-10.7-24-24-24H82.2zM192 32c-11.5 0-22.5 4.6-30.6 12.7L45.6 160.8C36.9 169.5 32 181.3 32 193.6C32 219.2 52.8 240 78.4 240H112v96c0 26.5 21.5 48 48 48h64c26.5 0 48-21.5 48-48V240h33.6c25.6 0 46.4-20.8 46.4-46.4c0-12.3-4.9-24.1-13.6-32.8L222.6 44.7C214.5 36.6 203.5 32 192 32zM24 432c-13.3 0-24 10.7-24 24s10.7 24 24 24H360c13.3 0 24-10.7 24-24s-10.7-24-24-24H24z" />
  </SvgIcon>
);
