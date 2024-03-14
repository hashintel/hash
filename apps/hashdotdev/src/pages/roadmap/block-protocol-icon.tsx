import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const BlockProtocolIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} width="10" height="14" viewBox="0 0 10 14" fill="none">
      <path d="M5.185 2.8H2.79192V1.6C2.79192 1.17565 2.62384 0.768689 2.32465 0.468631C2.02545 0.168573 1.61966 0 1.19654 0H0V12.4C0 12.8243 0.168083 13.2313 0.467276 13.5314C0.766469 13.8314 1.17226 14 1.59538 14H2.79192V11.2H5.185C6.26752 11.1589 7.29206 10.6988 8.04345 9.9162C8.79484 9.13359 9.21462 8.08943 9.21462 7.003C9.21462 5.91657 8.79484 4.87241 8.04345 4.08981C7.29206 3.30721 6.26752 2.84706 5.185 2.806V2.8ZM5.185 8.4H2.79192V5.6H5.185C5.98269 5.6 6.5311 6.233 6.5311 7C6.5311 7.767 5.98269 8.397 5.185 8.397V8.4Z" />
    </SvgIcon>
  );
};
