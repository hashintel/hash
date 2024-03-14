import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowDownAZRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon {...props} viewBox="0 0 576 512" fill="none">
      <path d="M47 377l96 96c9.4 9.4 24.6 9.4 33.9 0l96-96c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-55 55V56c0-13.3-10.7-24-24-24s-24 10.7-24 24V398.1L81 343c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9zm305-89c-13.3 0-24 10.7-24 24s10.7 24 24 24h74.6L334.1 440.1c-6.3 7.1-7.8 17.2-4 25.8S342.6 480 352 480H480c13.3 0 24-10.7 24-24s-10.7-24-24-24H405.4l92.5-104.1c6.3-7.1 7.8-17.2 4-25.8S489.4 288 480 288H352zM416 32c-9.1 0-17.4 5.1-21.5 13.3l-80 160c-5.9 11.9-1.1 26.3 10.7 32.2s26.3 1.1 32.2-10.7L370.8 200H456c1.7 0 3.3-.2 4.9-.5l13.6 27.2c5.9 11.9 20.3 16.7 32.2 10.7s16.7-20.3 10.7-32.2l-80-160C433.4 37.1 425.1 32 416 32zM394.8 152L416 109.7 437.2 152H394.8z" />{" "}
    </SvgIcon>
  );
};
