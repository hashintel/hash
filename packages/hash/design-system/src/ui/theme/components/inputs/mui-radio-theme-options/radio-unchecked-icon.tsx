import React, { FC } from "react";
import { SvgIcon, SvgIconProps } from "@mui/material";

export const RadioUncheckedIcon: FC<SvgIconProps> = ({
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
      <circle cx="8" cy="8" r="8" fill="#C1CFDE" />
      <circle cx="8" cy="8" r="7" fill="white" />
    </SvgIcon>
  );
};
