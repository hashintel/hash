import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const CloseIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => {
  return (
    <SvgIcon
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      {...props}
      sx={[
        ({ palette }) => ({ fill: palette.gray[50], fontSize: 12 }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <path d="M10.7812 2.28125L7.03125 6.03125L10.75 9.75C11.0625 10.0312 11.0625 10.5 10.75 10.7812C10.4688 11.0938 10 11.0938 9.71875 10.7812L5.96875 7.0625L2.25 10.7812C1.96875 11.0938 1.5 11.0938 1.21875 10.7812C0.90625 10.5 0.90625 10.0312 1.21875 9.71875L4.9375 6L1.21875 2.28125C0.90625 2 0.90625 1.53125 1.21875 1.21875C1.5 0.9375 1.96875 0.9375 2.28125 1.21875L6 4.96875L9.71875 1.25C10 0.9375 10.4688 0.9375 10.7812 1.25C11.0625 1.53125 11.0625 2 10.7812 2.28125Z" />
    </SvgIcon>
  );
};
