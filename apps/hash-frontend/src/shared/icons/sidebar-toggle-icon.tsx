import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const SidebarToggleIcon: FunctionComponent<SvgIconProps> = (props) => {
  const { sx = [], ...otherProps } = props;
  return (
    <SvgIcon
      viewBox="0 0 20 20"
      fill="none"
      sx={[
        {
          width: "1em",
          height: "1em",
          fontSize: 20,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...otherProps}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 16C3.44771 16 3 15.6281 3 15.1692L3 4.83077C3 4.37195 3.44772 4 4 4C4.55229 4 5 4.37195 5 4.83077L5 15.1692C5 15.6281 4.55228 16 4 16Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.7364 15.7407C13.3849 16.0864 12.8151 16.0864 12.4636 15.7407L7.2636 10.626C7.09482 10.4599 7 10.2348 7 10C7 9.76522 7.09482 9.54005 7.2636 9.37403L12.4636 4.25928C12.8151 3.91357 13.3849 3.91357 13.7364 4.25928C14.0879 4.605 14.0879 5.1655 13.7364 5.51121L9.17279 10L13.7364 14.4888C14.0879 14.8345 14.0879 15.395 13.7364 15.7407Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 9.99999C8 9.44771 8.37563 9 8.83898 9L18.161 9.00001C18.6244 9.00001 19 9.44773 19 10C19 10.5523 18.6244 11 18.161 11L8.83898 11C8.37562 11 8 10.5523 8 9.99999Z"
        fill="currentColor"
      />
    </SvgIcon>
  );
};
