import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowDownLeftAndArrowUpRightToCenterIcon: FunctionComponent<
  SvgIconProps
> = ({ sx, ...props }) => (
  <SvgIcon {...props} viewBox="0 0 512 512" sx={sx}>
    <path d="M502.6 54.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L336 130.7V80c0-17.7-14.3-32-32-32s-32 14.3-32 32V208c0 17.7 14.3 32 32 32H432c17.7 0 32-14.3 32-32s-14.3-32-32-32H381.3L502.6 54.6zM80 272c-17.7 0-32 14.3-32 32s14.3 32 32 32h50.7L9.4 457.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L176 381.3V432c0 17.7 14.3 32 32 32s32-14.3 32-32V304c0-17.7-14.3-32-32-32H80z" />{" "}
  </SvgIcon>
);
