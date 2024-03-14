import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const RulerRegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      height="16"
      width="16"
      viewBox="0 0 512 512"
      fill="none"
      {...props}
    >
      <path d="M63.2 379.3c-6.2-6.2-6.2-16.4 0-22.6l39.4-39.4 30.1 30.1c6.2 6.2 16.4 6.2 22.6 0s6.2-16.4 0-22.6l-30.1-30.1 41.4-41.4 30.1 30.1c6.2 6.2 16.4 6.2 22.6 0s6.2-16.4 0-22.6l-30.1-30.1 41.4-41.4 30.1 30.1c6.2 6.2 16.4 6.2 22.6 0s6.2-16.4 0-22.6l-30.1-30.1 41.4-41.4 30.1 30.1c6.2 6.2 16.4 6.2 22.6 0s6.2-16.4 0-22.6l-30.1-30.1 39.4-39.4c6.2-6.2 16.4-6.2 22.6 0l69.5 69.5c6.2 6.2 6.2 16.4 0 22.6L155.3 448.8c-6.2 6.2-16.4 6.2-22.6 0L63.2 379.3zM98.7 482.7c25 25 65.5 25 90.5 0L482.7 189.3c25-25 25-65.5 0-90.5L413.3 29.3c-25-25-65.5-25-90.5 0L29.3 322.7c-25 25-25 65.5 0 90.5l69.5 69.5z" />
    </SvgIcon>
  );
};
