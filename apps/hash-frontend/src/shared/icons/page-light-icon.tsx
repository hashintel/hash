import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const PageLightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 384 512">
      <path d="M64 480H320c17.7 0 32-14.3 32-32V138.5c0-8.5-3.4-16.6-9.4-22.6L268.1 41.4c-6-6-14.1-9.4-22.6-9.4H64C46.3 32 32 46.3 32 64V448c0 17.7 14.3 32 32 32zm256 32H64c-35.3 0-64-28.7-64-64V64C0 28.7 28.7 0 64 0H245.5c17 0 33.3 6.7 45.3 18.7l74.5 74.5c12 12 18.7 28.3 18.7 45.3V448c0 35.3-28.7 64-64 64z" />
    </SvgIcon>
  );
};
