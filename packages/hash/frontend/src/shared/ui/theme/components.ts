import { Components, Theme } from "@mui/material/styles";
import {
  MuiIconButtonThemeOptions,
  MuiListItemButtonThemeOptions,
  MuiListItemTextThemeOptions,
  MuiTooltipThemeOptions,
} from "./components/data-display";
import {
  MuiDrawerThemeOptions,
  MuiMenuThemeOptions,
  MuiMenuItemThemeOptions,
} from "./components/navigation";
import {
  MuiButtonThemeOptions,
  MuiOutlinedInputThemeOptions,
  MuiRadioThemeOptions,
  MuiCheckboxThemeOptions,
  MuiInputLabelThemeOptions,
  MuiSwitchThemeOptions,
} from "./components/inputs";
import { MuiCssBaselineThemeOptions } from "./components/utils";
import { MuiSelectThemeOptions } from "./components/inputs/mui-select-theme-options";

export const components: Components<Theme> = {
  /** ===== INPUTS ===== */
  MuiButton: MuiButtonThemeOptions,
  MuiOutlinedInput: MuiOutlinedInputThemeOptions,
  MuiInputLabel: MuiInputLabelThemeOptions,
  MuiSwitch: MuiSwitchThemeOptions,
  MuiRadio: MuiRadioThemeOptions,
  MuiCheckbox: MuiCheckboxThemeOptions,
  MuiSelect: MuiSelectThemeOptions,
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
