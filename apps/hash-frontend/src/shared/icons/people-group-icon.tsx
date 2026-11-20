import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const PeopleGroupIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon width="640" height="512" {...props} icon="users" />;
};
