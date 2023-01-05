import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const ItalicIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      {...props}
      width="384"
      height="512"
      viewBox="0 0 384 512"
      fill="none"
    >
      <path d="M384 56c0 13.25-10.75 24-24 24h-67.98l-146.9 352H232c13.25 0 24 10.75 24 24S245.3 480 232 480h-208C10.75 480 0 469.3 0 456s10.75-24 24-24h70.6l146.9-352H152C138.8 80 128 69.25 128 56S138.8 32 152 32h208C373.3 32 384 42.75 384 56z" />
    </SvgIcon>
  );
};
