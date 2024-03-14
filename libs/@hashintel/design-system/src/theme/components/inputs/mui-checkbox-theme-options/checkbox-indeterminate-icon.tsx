import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const CheckboxIndeterminateIcon: FunctionComponent<SvgIconProps> = ({
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
      <path
        d="M5 8.75C5 8.49609 5.15625 8.28125 5.375 8.28125H12.625C12.8281 8.28125 13 8.49609 13 8.75C13 9.02344 12.8281 9.21875 12.625 9.21875H5.375C5.15625 9.21875 5 9.02344 5 8.75Z"
        fill="#0775E3"
      />
    </SvgIcon>
  );
};
