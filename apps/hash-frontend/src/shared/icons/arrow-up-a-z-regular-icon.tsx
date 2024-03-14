import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowUpZARegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon {...props} viewBox="0 0 576 512" fill="none">
      <path d="M352 32H480c9.4 0 18 5.5 21.9 14.2s2.3 18.7-4 25.8L405.4 176H480c13.3 0 24 10.7 24 24s-10.7 24-24 24H352c-9.4 0-18-5.5-21.9-14.2s-2.3-18.7 4-25.8L426.6 80H352c-13.3 0-24-10.7-24-24s10.7-24 24-24zM143 39c9.4-9.4 24.6-9.4 33.9 0l96 96c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-55-55V456c0 13.3-10.7 24-24 24s-24-10.7-24-24V113.9L81 169c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l96-96zM416 272c9.1 0 17.4 5.1 21.5 13.3l80 160c5.9 11.9 1.1 26.3-10.7 32.2s-26.3 1.1-32.2-10.7l-13.6-27.2c-1.6 .3-3.2 .5-4.9 .5H370.8l-13.4 26.7c-5.9 11.9-20.3 16.7-32.2 10.7s-16.7-20.3-10.7-32.2l80-160c4.1-8.1 12.4-13.3 21.5-13.3zM394.8 392h42.3L416 349.7 394.8 392z" />{" "}
    </SvgIcon>
  );
};
