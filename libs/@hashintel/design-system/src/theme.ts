import createCache from "@emotion/cache";
import type { ThemeOptions } from "@mui/material";
import { createTheme } from "@mui/material";

import { borderRadii } from "./theme/border-radii.js";
import { components } from "./theme/components.js";
import { palette } from "./theme/palette.js";
import { boxShadows, dropShadows, shadows } from "./theme/shadows.js";
import { typography } from "./theme/typography.js";

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

export * from "./fluid-fonts.js";
// @todo - consider re-exporting textFieldBorderRadius from another file
export { textFieldBorderRadius } from "./theme/components/inputs/mui-outlined-input-theme-options.js";
export * from "./theme/palette.js";
