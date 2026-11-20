import { HashSvgIcon } from "@hashintel/design-system";

import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

export const CalendarLightIcon: FunctionComponent<SvgIconProps> = (props) => {
  return <HashSvgIcon {...props} height="16" width="14" icon="calendarBlank" />;
};
