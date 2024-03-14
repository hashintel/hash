import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const RectangleHistoryCirclePlusIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon
      width="640"
      height="512"
      viewBox="0 0 640 512"
      fill="none"
      {...props}
    >
      <path d="M64 464l284.5 0c12.3 18.8 28 35.1 46.3 48L64 512c-35.3 0-64-28.7-64-64V224c0-35.3 28.7-64 64-64l384 0c23.8 0 44.5 12.9 55.5 32.2c-2.5-.1-5-.2-7.5-.2c-26.2 0-51.1 5.7-73.4 16L64 208c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16zM440 80c13.3 0 24 10.7 24 24s-10.7 24-24 24L72 128c-13.3 0-24-10.7-24-24s10.7-24 24-24l368 0zM392 0c13.3 0 24 10.7 24 24s-10.7 24-24 24L120 48c-13.3 0-24-10.7-24-24s10.7-24 24-24H392zM496 224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zm16 80c0-8.8-7.2-16-16-16s-16 7.2-16 16v48H432c-8.8 0-16 7.2-16 16s7.2 16 16 16h48v48c0 8.8 7.2 16 16 16s16-7.2 16-16V384h48c8.8 0 16-7.2 16-16s-7.2-16-16-16H512V304z" />
    </SvgIcon>
  );
};
