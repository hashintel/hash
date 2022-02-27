import { createTheme } from "@mui/material";
import createCache from "@emotion/cache";

import { palette } from "./palette";
import { typography } from "./typography";
import { shadows, boxShadows, dropShadows } from "./shadows";
import { borderRadii } from "./borderRadii";
import { components } from "./components";

export const theme = createTheme({
  palette,
  typography,
  shadows,
  borderRadii,
  boxShadows,
  dropShadows,
  components,
});

export const createEmotionCache = () => createCache({ key: "css" });
