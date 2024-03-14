import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const ArrowTurnDownRightIcon: FunctionComponent<SvgIconProps> = ({
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
      sx={[
        ({ palette }) => ({ fill: palette.gray[70], fontSize: 12 }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64V224c0 53 43 96 96 96H402.7l-73.4 73.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3l-128-128c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L402.7 256H96c-17.7 0-32-14.3-32-32V64z" />
    </SvgIcon>
  );
};
