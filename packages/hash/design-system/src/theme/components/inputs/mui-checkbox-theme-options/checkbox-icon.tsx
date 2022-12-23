import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const CheckboxIcon: FunctionComponent<SvgIconProps> = ({
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
      <rect width="16" height="16" rx="4" fill="currentColor" />
      <path
        d="M12.2069 4.79279C12.3944 4.98031 12.4997 5.23462 12.4997 5.49979C12.4997 5.76495 12.3944 6.01926 12.2069 6.20679L7.20692 11.2068C7.01939 11.3943 6.76508 11.4996 6.49992 11.4996C6.23475 11.4996 5.98045 11.3943 5.79292 11.2068L3.79292 9.20679C3.61076 9.01818 3.50997 8.76558 3.51224 8.50339C3.51452 8.24119 3.61969 7.99038 3.8051 7.80497C3.99051 7.61956 4.24132 7.51439 4.50352 7.51211C4.76571 7.50983 5.01832 7.61063 5.20692 7.79279L6.49992 9.08579L10.7929 4.79279C10.9804 4.60532 11.2348 4.5 11.4999 4.5C11.7651 4.5 12.0194 4.60532 12.2069 4.79279Z"
        fill="white"
      />
    </SvgIcon>
  );
};
