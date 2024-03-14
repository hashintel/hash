import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowUpRightAndArrowDownLeftFromCenterIcon: FunctionComponent<
  SvgIconProps
> = ({ sx, ...props }) => (
  <SvgIcon {...props} viewBox="0 0 512 512" sx={sx}>
    <path d="M352 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h50.7L297.4 169.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V160c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H352zM214.6 297.4c-12.5-12.5-32.8-12.5-45.3 0L64 402.7V352c0-17.7-14.3-32-32-32s-32 14.3-32 32V480c0 17.7 14.3 32 32 32H160c17.7 0 32-14.3 32-32s-14.3-32-32-32H109.3L214.6 342.6c12.5-12.5 12.5-32.8 0-45.3z" />{" "}
  </SvgIcon>
);
