import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CreateEntityIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon
      {...props}
      width="17.82"
      height="15.78"
      fill="none"
      icon="asteriskBolt"
      ink="#91A5BA"
    />
  );
};
