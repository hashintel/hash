import { Components, Theme } from "@mui/material/styles";
import { MuiSwitchThemeOptions } from "./inputs/MuiSwitchThemeOptions";
import { MuiButtonThemeOptions } from "./inputs/MuiButtonThemeOptions";
import { MuiTooltipThemeOptions } from "./dataDisplay/MuiTooltipThemeOptions";
import { MuiDrawerThemeOptions } from "./navigation/MuiDrawerThemeOptions";

import { MuiCssBaselineThemeOptions } from "./utils/MuiCssBaselineThemeOptions";
import { MuiIconButtonThemeOptions } from "./dataDisplay/MuiIconButtonThemeOptions";
import { MuiListItemButtonThemeOptions } from "./dataDisplay/MuiListItemButtonThemeOptions";
import { MuiListItemTextThemeOptions } from "./dataDisplay/MuiListItemTextThemeOptions";
import { MuiMenuThemeOptions } from "./navigation/MuiMenuThemeOptions";
import { MuiMenuItemThemeOptions } from "./navigation/MuiMenuItemThemeOptions";
import { MuiOutlinedInputThemeOptions } from "./inputs/MuiOutlinedInputThemeOptions";
import { MuiRadioThemeOptions } from "./inputs/MuiRadioThemeOptions";
import { MuiCheckboxThemeOptions } from "./inputs/MuiCheckboxThemeOptions";

export const components: Components<Theme> = {
  /** ===== INPUTS ===== */
  MuiButton: MuiButtonThemeOptions,
  MuiOutlinedInput: MuiOutlinedInputThemeOptions,
  MuiSwitch: MuiSwitchThemeOptions,
  MuiRadio: MuiRadioThemeOptions,
  MuiCheckbox: MuiCheckboxThemeOptions,
  /** ===== DATA DISPLAY ===== */
  MuiIconButton: MuiIconButtonThemeOptions,
  MuiTooltip: MuiTooltipThemeOptions,
  MuiListItemButton: MuiListItemButtonThemeOptions,
  MuiListItemText: MuiListItemTextThemeOptions,
  /** ===== FEEDBACK ===== */
  /** ===== SURFACES ===== */
  /** ===== NAVIGATION ===== */
  MuiDrawer: MuiDrawerThemeOptions,
  MuiMenu: MuiMenuThemeOptions,
  MuiMenuItem: MuiMenuItemThemeOptions,

  /** ===== LAYOUT ===== */
  /** ===== UTILS ===== */
  MuiCssBaseline: MuiCssBaselineThemeOptions,
  /** ===== DATA GRID ===== */
};
