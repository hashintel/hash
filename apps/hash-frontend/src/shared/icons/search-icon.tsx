import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const SearchIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon
      {...props}
      width="17"
      height="16"
      fill="none"
      icon="search"
      ink="#91A5BA"
    />
  );
};
