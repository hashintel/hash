import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const Grid2PlusIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      width="512"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
      {...props}
    >
      <path d="M160 80H64v96h96V80zM64 32h96c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48H64c-26.5 0-48-21.5-48-48V80c0-26.5 21.5-48 48-48zm96 304H64v96h96V336zM64 288h96c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48H64c-26.5 0-48-21.5-48-48V336c0-26.5 21.5-48 48-48zM320 80v96h96V80H320zm-48 0c0-26.5 21.5-48 48-48h96c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48H320c-26.5 0-48-21.5-48-48V80zm96 192c13.3 0 24 10.7 24 24v64h64c13.3 0 24 10.7 24 24s-10.7 24-24 24H392v64c0 13.3-10.7 24-24 24s-24-10.7-24-24V408H280c-13.3 0-24-10.7-24-24s10.7-24 24-24h64V296c0-13.3 10.7-24 24-24z" />
    </SvgIcon>
  );
};
