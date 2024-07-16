import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ShapesRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      width="512"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
      {...props}
    >
      <path d="M411.4 175.5c5.9 9.9 6.1 22.2 .4 32.2s-16.3 16.2-27.8 16.2H192c-11.5 0-22.2-6.2-27.8-16.2s-5.5-22.3 .4-32.2l96-160C266.3 5.9 276.8 0 288 0s21.7 5.9 27.4 15.5l96 160zM288 32L192 192H384L288 32zM472 304H328c-4.4 0-8 3.6-8 8V456c0 4.4 3.6 8 8 8H472c4.4 0 8-3.6 8-8V312c0-4.4-3.6-8-8-8zM328 272H472c22.1 0 40 17.9 40 40V456c0 22.1-17.9 40-40 40H328c-22.1 0-40-17.9-40-40V312c0-22.1 17.9-40 40-40zM224 384A96 96 0 1 0 32 384a96 96 0 1 0 192 0zM0 384a128 128 0 1 1 256 0A128 128 0 1 1 0 384z" />
    </SvgIcon>
  );
};
