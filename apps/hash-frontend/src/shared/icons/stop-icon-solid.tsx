import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const StopIconSolid: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      {...props}
      width="384"
      height="512"
      viewBox="0 0 384 512"
      fill="none"
    >
      <path d="M0 128C0 92.7 28.7 64 64 64H320c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128z" />
    </SvgIcon>
  );
};
