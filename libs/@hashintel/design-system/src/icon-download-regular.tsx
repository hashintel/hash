import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const DownloadRegularIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => {
  return (
    <SvgIcon
      width="512"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
      {...props}
      sx={Array.isArray(sx) ? sx : [sx]}
    >
      <path d="M280 24c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 270.1-95-95c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9L239 369c9.4 9.4 24.6 9.4 33.9 0L409 233c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-95 95L280 24zM128.8 304L64 304c-35.3 0-64 28.7-64 64l0 80c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-80c0-35.3-28.7-64-64-64l-64.8 0-48 48L448 352c8.8 0 16 7.2 16 16l0 80c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16l0-80c0-8.8 7.2-16 16-16l112.8 0-48-48zM432 408a24 24 0 1 0 -48 0 24 24 0 1 0 48 0z" />
    </SvgIcon>
  );
};
