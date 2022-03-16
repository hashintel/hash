import { Components, Theme } from "@mui/material/styles";
import { MuiButtonThemeOptions } from "./inputs/MuiButtonThemeOptions";
import { MuiTooltipThemeOptions } from "./dataDisplay/MuiTooltipThemeOptions";
import { MuiDrawerThemeOptions } from "./navigation/MuiDrawerThemeOptions";

import { MuiCssBaselineThemeOptions } from "./utils/MuiCssBaselineThemeOptions";
import { MuiIconButtonThemeOptions } from "./dataDisplay/MuiIconButtonThemeOptions";
import { MuiListItemButtonThemeOptions } from "./dataDisplay/MuiListItemButtonThemeOptions";
import { MuiOutlinedInputThemeOptions } from "./inputs/MuiOutlinedInputThemeOptions";

export const components: Components<Theme> = {
  /** ===== INPUTS ===== */
  MuiButton: MuiButtonThemeOptions,
  MuiOutlinedInput: MuiOutlinedInputThemeOptions,
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
