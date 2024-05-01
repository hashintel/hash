import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const CircleEllipsisRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon
      width="512"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
      {...props}
    >
      <path d="M256 464a208 208 0 1 0 0-416 208 208 0 1 0 0 416zM256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zm32 256a32 32 0 1 1 -64 0 32 32 0 1 1 64 0zm64-32a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM192 256a32 32 0 1 1 -64 0 32 32 0 1 1 64 0z" />
    </SvgIcon>
  );
};
