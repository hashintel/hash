import { SvgIcon, SvgIconProps } from "@mui/material";
import { FunctionComponent } from "react";

export const PlusBoxOutlineIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M17.25 5.25C18.078 5.25 18.75 5.922 18.75 6.75V17.25C18.75 18.0787 18.078 18.75 17.25 18.75H6.75C5.922 18.75 5.25 18.0787 5.25 17.25V6.75C5.25 5.922 5.922 5.25 6.75 5.25H17.25ZM17.2501 17.25V6.75H6.75007V17.2507L17.2501 17.25ZM12.7506 8.25143H11.2506V11.2514H8.2506V12.7514H11.2506V15.7514H12.7506V12.7514H15.7506V11.2514H12.7506V8.25143Z"
        fill="currentColor"
      />
    </SvgIcon>
  );
};
