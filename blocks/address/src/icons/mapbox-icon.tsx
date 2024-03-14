import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const MapboxIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
      <path
        d="M8 0C3.58155 0 0 3.58155 0 8C0 12.4184 3.58155 16 8 16C12.4184 16 16 12.4184 16 8C16 3.58155 12.4184 0 8 0ZM11.7975 9.96175C9.06187 12.6974 4.17548 11.8245 4.17548 11.8245C4.17548 11.8245 3.29359 6.94713 6.03825 4.20247C7.55905 2.68166 10.0787 2.74466 11.6715 4.32846C13.2643 5.91226 13.3183 8.44094 11.7975 9.96175Z"
        fill="#758AA1"
      />
      <path
        d="M8.91788 4.68841L8.13498 6.29921L6.52418 7.08211L8.13498 7.86502L8.91788 9.47581L9.70079 7.86502L11.3116 7.08211L9.70079 6.29921L8.91788 4.68841Z"
        fill="#758AA1"
      />
    </SvgIcon>
  );
};
