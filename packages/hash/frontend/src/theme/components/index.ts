import { ThemeOptions } from "@mui/material";
import { MuiButtonThemeOptions } from "./inputs/MuiButtonThemeOptions";
import { MuiTooltipThemeOptions } from "./dataDisplay/MuiTooltipThemeOptions";
import { MuiDrawerThemeOptions } from "./navigation/MuiDrawerThemeOptions";

import { MuiCssBaselineThemeOptions } from "./utils/MuiCssBaselineThemeOptions";
// @todo-mui merge both MuiIconButtonThemeOptions into 1
import { MuiIconButtonThemeOptions } from "./dataDisplay/MuiIconButtonThemeOptions";
// import { MuiIconButtonThemeOptions } from './inputs/MuiIconButtonThemeOptions'

export const components: ThemeOptions["components"] = {
  /** ===== INPUTS ===== */
  MuiButton: MuiButtonThemeOptions,
  /** ===== DATA DISPLAY ===== */
  MuiIconButton: MuiIconButtonThemeOptions,
  MuiTooltip: MuiTooltipThemeOptions,
  /** ===== FEEDBACK ===== */
  /** ===== SURFACES ===== */
  /** ===== NAVIGATION ===== */
  MuiDrawer: MuiDrawerThemeOptions,
  /** ===== LAYOUT ===== */
  /** ===== UTILS ===== */
  MuiCssBaseline: MuiCssBaselineThemeOptions,
  /** ===== DATA GRID ===== */
};
