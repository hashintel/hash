import { createTheme } from "@mui/material";
import createCache from "@emotion/cache";

import { palette } from "./palette";
import { typography } from "./typography";
import { shadows } from "./shadows";
import { components } from "./components";

export const theme = createTheme({
  palette,
  typography,
  shadows,
  components,
});

export const createEmotionCache = () => createCache({ key: "css" });
