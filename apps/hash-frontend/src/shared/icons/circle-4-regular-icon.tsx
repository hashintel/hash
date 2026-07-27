import { SvgIcon } from "@mui/material";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const Circle4RegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512">
      <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM200 144c-13.3 0-24 10.7-24 24l0 96c0 22.1 17.9 40 40 40l56 0 0 40c0 13.3 10.7 24 24 24s24-10.7 24-24l0-40 8 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-8 0 0-88c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 88-48 0 0-88c0-13.3-10.7-24-24-24z" />
    </SvgIcon>
  );
};
