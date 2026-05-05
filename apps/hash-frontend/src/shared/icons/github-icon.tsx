import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const GitHubIcon: FunctionComponent<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path
      d="M12 1.27a11 11 0 0 0-3.48 21.46c.55.09.73-.28.73-.55v-1.84c-3.03.64-3.67-1.46-3.67-1.46-.55-1.29-1.28-1.65-1.28-1.65-.92-.65.1-.65.1-.65 1.1 0 1.73 1.1 1.73 1.1.92 1.65 2.57 1.2 3.21.92a2.16 2.16 0 0 1 .64-1.47c-2.47-.27-5.04-1.19-5.04-5.5 0-1.1.46-2.1 1.27-2.84a4.35 4.35 0 0 1 .2-2.77s.91-.29 3.11 1.1a11 11 0 0 1 5.5 0c2.1-1.39 3.02-1.1 3.02-1.1a4.35 4.35 0 0 1 .2 2.77 4.07 4.07 0 0 1 1.18 2.84c0 4.32-2.58 5.23-5.04 5.5.45.37.82.92.82 2.02v3.03c0 .27.18.64.73.55A11 11 0 0 0 12 1.27"
      fill="currentColor"
    />
  </SvgIcon>
);
