import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const FilterListIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512" fill="none">
      <path d="M40 64C24.2 64 9.9 73.3 3.5 87.7s-3.8 31.3 6.8 43L112 243.8V368c0 10.1 4.7 19.6 12.8 25.6l64 48c9.7 7.3 22.7 8.4 33.5 3s17.7-16.5 17.7-28.6V243.8l101.7-113c10.6-11.7 13.2-28.6 6.8-43S327.8 64 312 64H40zM352 384c-17.7 0-32 14.3-32 32s14.3 32 32 32H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H352zM320 256c0 17.7 14.3 32 32 32H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H352c-17.7 0-32 14.3-32 32zM416 64c-17.7 0-32 14.3-32 32s14.3 32 32 32h64c17.7 0 32-14.3 32-32s-14.3-32-32-32H416z" />{" "}
    </SvgIcon>
  );
};
