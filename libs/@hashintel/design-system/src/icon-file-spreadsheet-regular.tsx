import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const SpreadsheetFileIconRegular: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon
      width="384"
      height="512"
      viewBox="0 0 384 512"
      fill="none"
      {...props}
    >
      <path d="M48 448V64c0-8.8 7.2-16 16-16H224v80c0 17.7 14.3 32 32 32h80V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16zM64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V154.5c0-17-6.7-33.3-18.7-45.3L274.7 18.7C262.7 6.7 246.5 0 229.5 0H64zM176 256v48H112V256h64zm-64 80h64v48H112V336zm96 0h64v48H208V336zm-16 80h16 64c17.7 0 32-14.3 32-32V336 320 304 256c0-17.7-14.3-32-32-32H208 192 176 112c-17.7 0-32 14.3-32 32v48 16 16 48c0 17.7 14.3 32 32 32h64 16zm16-112V256h64v48H208z" />
    </SvgIcon>
  );
};
