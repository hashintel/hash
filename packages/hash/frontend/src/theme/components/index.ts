import { ThemeOptions } from "@mui/material";
import { MuiButtonThemeOptions } from "./inputs/MuiButtonThemeOptions";
import { MuiIconButtonThemeOptions } from "./dataDisplay/MuiIconButtonThemeOptions";

import { MuiCssBaselineThemeOptions } from "./utils/MuiCssBaselineThemeOptions";
import { MuiListItemButtonThemeOptions } from "./dataDisplay/MuiListItemButtonThemeOptions";

export const components: ThemeOptions["components"] = {
  /** ===== INPUTS ===== */
  MuiButton: MuiButtonThemeOptions,
  /** ===== DATA DISPLAY ===== */
  MuiIconButton: MuiIconButtonThemeOptions,
  MuiListItemButton: MuiListItemButtonThemeOptions,
  /** ===== FEEDBACK ===== */
  /** ===== SURFACES ===== */
  /** ===== NAVIGATION ===== */
  /** ===== LAYOUT ===== */
  /** ===== UTILS ===== */
  MuiCssBaseline: MuiCssBaselineThemeOptions,
  /** ===== DATA GRID ===== */
};
