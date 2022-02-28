import { ThemeOptions } from "@mui/material";
import { MuiButtonThemeOptions } from "./inputs/MuiButtonThemeOptions";

import { MuiCssBaselineThemeOptions } from "./utils/MuiCssBaselineThemeOptions";

export const components: ThemeOptions["components"] = {
  /** ===== INPUTS ===== */
  /** ===== DATA DISPLAY ===== */
  /** ===== FEEDBACK ===== */
  /** ===== SURFACES ===== */
  /** ===== NAVIGATION ===== */
  /** ===== LAYOUT ===== */
  /** ===== UTILS ===== */
  MuiCssBaseline: MuiCssBaselineThemeOptions,
  MuiButton: MuiButtonThemeOptions,
  /** ===== DATA GRID ===== */
};
