import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const CheckboxCheckedIcon: FunctionComponent<SvgIconProps> = ({
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
      viewBox="0 0 18 18"
      fill="none"
    >
      <rect width="18" height="18" rx="4" fill="#0775E3" />
      <path
        d="M14.3359 5.41406C14.5469 5.64844 14.5469 6 14.3359 6.21094L8.14844 12.3984C7.91406 12.6328 7.5625 12.6328 7.35156 12.3984L4.16406 9.21094C3.92969 9 3.92969 8.64844 4.16406 8.4375C4.375 8.20312 4.72656 8.20312 4.9375 8.4375L7.72656 11.2266L13.5391 5.41406C13.75 5.20312 14.1016 5.20312 14.3125 5.41406H14.3359Z"
        fill="white"
      />
    </SvgIcon>
  );
};
