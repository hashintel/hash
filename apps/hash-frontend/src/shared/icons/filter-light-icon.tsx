import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const FilterLightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512" fill="none">
      <path d="M0 71.5C0 49.7 17.7 32 39.5 32l432.9 0C494.3 32 512 49.7 512 71.5c0 9.2-3.2 18.1-9.1 25.2L320 317.8l0 128.4c0 18.7-15.2 33.9-33.9 33.9c-7.5 0-14.8-2.5-20.8-7.1l-61-47.4c-7.8-6.1-12.4-15.4-12.4-25.3l0-82.4L9.1 96.7C3.2 89.6 0 80.7 0 71.5zM39.5 64c-4.2 0-7.5 3.4-7.5 7.5c0 1.8 .6 3.4 1.7 4.8L220.3 301.8c2.4 2.9 3.7 6.5 3.7 10.2l0 88.2 61 47.4c.3 .3 .7 .4 1.1 .4c1 0 1.9-.8 1.9-1.9L288 312c0-3.7 1.3-7.3 3.7-10.2L478.3 76.3c1.1-1.3 1.7-3 1.7-4.8c0-4.2-3.4-7.5-7.5-7.5L39.5 64z" />
    </SvgIcon>
  );
};
