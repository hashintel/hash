import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const TextIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      width="448"
      height="512"
      viewBox="0 0 448 512"
      fill="none"
      {...props}
    >
      <path d="M448 56v80C448 149.3 437.3 160 424 160S400 149.3 400 136V80h-152v352h48c13.25 0 24 10.75 24 24S309.3 480 296 480h-144C138.8 480 128 469.3 128 456s10.75-24 24-24h48v-352H48v56C48 149.3 37.25 160 24 160S0 149.3 0 136v-80C0 42.75 10.75 32 24 32h400C437.3 32 448 42.75 448 56z" />
    </SvgIcon>
  );
};
