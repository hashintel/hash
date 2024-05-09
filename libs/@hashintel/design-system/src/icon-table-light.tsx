import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const TableLightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      width="512"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
      {...props}
    >
      <path d="M64 64C46.3 64 32 78.3 32 96l0 64 448 0V96c0-17.7-14.3-32-32-32L64 64zM32 192l0 112 208 0 0-112L32 192zm240 0l0 112H480l0-112-208 0zM240 336L32 336l0 80c0 17.7 14.3 32 32 32l176 0V336zm32 112H448c17.7 0 32-14.3 32-32V336H272V448zM0 96C0 60.7 28.7 32 64 32l384 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96z" />
    </SvgIcon>
  );
};
