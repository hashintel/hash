import { ThemeOptions } from "@mui/material";
import { MuiButtonThemeOptions } from "./inputs/MuiButtonThemeOptions";
import { MuiTooltipThemeOptions } from "./dataDisplay/MuiTooltipThemeOptions";
import { MuiDrawerThemeOptions } from "./navigation/MuiDrawerThemeOptions";

import { MuiCssBaselineThemeOptions } from "./utils/MuiCssBaselineThemeOptions";
import { MuiIconButtonThemeOptions } from "./dataDisplay/MuiIconButtonThemeOptions";
import { MuiListItemButtonThemeOptions } from "./dataDisplay/MuiListItemButtonThemeOptions";

export const components: ThemeOptions["components"] = {
  /** ===== INPUTS ===== */
  MuiButton: MuiButtonThemeOptions,
  /** ===== DATA DISPLAY ===== */
  MuiIconButton: MuiIconButtonThemeOptions,
  MuiTooltip: MuiTooltipThemeOptions,
  MuiListItemButton: MuiListItemButtonThemeOptions,
  /** ===== FEEDBACK ===== */
  /** ===== SURFACES ===== */
  /** ===== NAVIGATION ===== */
  MuiDrawer: MuiDrawerThemeOptions,
  /** ===== LAYOUT ===== */
  /** ===== UTILS ===== */
  MuiCssBaseline: MuiCssBaselineThemeOptions,
  /** ===== DATA GRID ===== */
};
