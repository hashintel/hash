import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const RadioCheckedIcon: FunctionComponent<SvgIconProps> = ({
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
          color: palette.blue[70],
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <circle cx="8" cy="8" r="3" fill="white" />
    </SvgIcon>
  );
};
