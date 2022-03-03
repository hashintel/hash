import { ThemeOptions } from "@mui/material";
import { MuiButtonThemeOptions } from "./inputs/MuiButtonThemeOptions";
import { MuiIconButtonThemeOptions } from "./inputs/MuiIconButtonThemeOptions";

import { MuiCssBaselineThemeOptions } from "./utils/MuiCssBaselineThemeOptions";

export const components: ThemeOptions["components"] = {
  /** ===== INPUTS ===== */
  MuiButton: MuiButtonThemeOptions,
  MuiIconButton: MuiIconButtonThemeOptions,
  /** ===== DATA DISPLAY ===== */
  /** ===== FEEDBACK ===== */
  /** ===== SURFACES ===== */
  /** ===== NAVIGATION ===== */
  /** ===== LAYOUT ===== */
  /** ===== UTILS ===== */
  MuiCssBaseline: MuiCssBaselineThemeOptions,
  /** ===== DATA GRID ===== */
};
