import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const MagnifyingGlassRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512" fill="none">
      <path d="M368 208A160 160 0 1 0 48 208a160 160 0 1 0 320 0zM337.1 371.1C301.7 399.2 256.8 416 208 416C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208c0 48.8-16.8 93.7-44.9 129.1L505 471c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0L337.1 371.1z" />{" "}
    </SvgIcon>
  );
};
