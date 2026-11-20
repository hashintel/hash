import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const TagIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <HashSvgIcon width="448" height="512" fill="none" {...props} icon="tag" />
  );
};
