import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const CheckIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      width="448"
      height="512"
      viewBox="0 0 448 512"
      fill="none"
      {...props}
    >
      <path d="M440.1 103C450.3 112.4 450.3 127.6 440.1 136.1L176.1 400.1C167.6 410.3 152.4 410.3 143 400.1L7.029 264.1C-2.343 255.6-2.343 240.4 7.029 231C16.4 221.7 31.6 221.7 40.97 231L160 350.1L407 103C416.4 93.66 431.6 93.66 440.1 103V103z" />
    </SvgIcon>
  );
};
