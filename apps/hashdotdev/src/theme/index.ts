/* eslint-disable canonical/filename-no-index -- @todo rename file */

import { createTheme } from "@mui/material";

import { components } from "./components";
import { palette } from "./palette";
import { typography } from "./typography";

export const theme = createTheme({
  palette,
  typography,
  components,
});
