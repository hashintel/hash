import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const CheckboxBlankIcon: FunctionComponent<SvgIconProps> = ({
  sx = [],
  ...otherProps
}) => {
  return (
    <SvgIcon
      {...otherProps}
      sx={[
        {
          width: "1em",
          height: "1em",
          fontSize: 16,
          fill: "none",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      viewBox="0 0 18 18"
      fill="none"
    >
      <rect x="0.5" y="0.5" width="17" height="17" rx="3.5" fill="white" />
      <rect x="0.5" y="0.5" width="17" height="17" rx="3.5" stroke="#DDE7F0" />
    </SvgIcon>
  );
};
