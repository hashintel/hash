import { createTheme, ThemeOptions } from "@mui/material/styles";
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
  /** @todo: figure out how to properly override this type */
  components: components as ThemeOptions["components"],
});

export const createEmotionCache = () => createCache({ key: "css" });
