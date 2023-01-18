import createCache from "@emotion/cache";
import { createTheme, ThemeOptions } from "@mui/material";

import { borderRadii } from "./theme/border-radii";
import { components } from "./theme/components";
import { palette } from "./theme/palette";
import { boxShadows, dropShadows, shadows } from "./theme/shadows";
import { typography } from "./theme/typography";

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

export const createEmotionCache = (key?: string) =>
  createCache({ key: key ?? "css" });

// @todo - consider re-exporting textFieldBorderRadius from another file
export { textFieldBorderRadius } from "./theme/components/inputs/mui-outlined-input-theme-options";
