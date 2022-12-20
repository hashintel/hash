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
        ({ palette }) => ({
          width: "1em",
          height: "1em",
          fontSize: 16,
          color: palette.gray[40],
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      viewBox="0 0 16 16"
      fill="none"
    >
      <rect width="16" height="16" rx="4" fill="currentColor" />
      <rect x="1" y="1" width="14" height="14" rx="3" fill="white" />
    </SvgIcon>
  );
};
