import { FC } from "react";
import { SvgIcon, SvgIconProps } from "@mui/material";

export const CheckboxBlankIcon: FC<SvgIconProps> = ({
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
      <path
        d="M0 4C0 1.79086 1.79086 0 4 0H12C14.2091 0 16 1.79086 16 4V12C16 14.2091 14.2091 16 12 16H4C1.79086 16 0 14.2091 0 12V4Z"
        fill="white"
      />
      <path
        d="M4 1H12V-1H4V1ZM15 4V12H17V4H15ZM12 15H4V17H12V15ZM1 12V4H-1V12H1ZM4 15C2.34315 15 1 13.6569 1 12H-1C-1 14.7614 1.23858 17 4 17V15ZM15 12C15 13.6569 13.6569 15 12 15V17C14.7614 17 17 14.7614 17 12H15ZM12 1C13.6569 1 15 2.34315 15 4H17C17 1.23858 14.7614 -1 12 -1V1ZM4 -1C1.23858 -1 -1 1.23858 -1 4H1C1 2.34315 2.34315 1 4 1V-1Z"
        fill="currentColor"
      />
    </SvgIcon>
  );
};
