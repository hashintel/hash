import { createTheme, ThemeOptions } from "@mui/material/styles";
import createCache from "@emotion/cache";

import { palette } from "./theme/palette";
import { typography } from "./theme/typography";
import { shadows, boxShadows, dropShadows } from "./theme/shadows";
import { borderRadii } from "./theme/border-radii";
import { components } from "./theme/components";

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
