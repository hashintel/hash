import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const QuickNoteIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon
      {...props}
      width="18"
      height="17"
      fill="none"
      icon="notePlus"
      ink="#91A5BA"
    />
  );
};
