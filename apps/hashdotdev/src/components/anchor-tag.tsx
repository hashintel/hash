import { Box } from "@mui/material";
import { FunctionComponent } from "react";

import { NAV_HEIGHT } from "./navbar";

export const AnchorTag: FunctionComponent<{ id: string }> = ({ id }) => (
  <Box
    component="a"
    id={id}
    sx={{
      display: "block",
      position: "relative",
      top: -(NAV_HEIGHT + 16),
      visibility: "hidden",
    }}
  />
);
