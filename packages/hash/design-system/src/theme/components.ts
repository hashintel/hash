import { Components, Theme } from "@mui/material";

import {
  MuiIconButtonThemeOptions,
  MuiListItemButtonThemeOptions,
  MuiListItemSecondaryActionThemeOptions,
  MuiListItemTextThemeOptions,
  MuiTooltipThemeOptions,
} from "./components/data-display";
import { MuiChipThemeOptions } from "./components/data-display/mui-chip-theme-options";
import { MuiSkeletonThemeOptions } from "./components/feedback/mui-skeleton-theme-options";
import {
  MuiButtonThemeOptions,
  MuiCheckboxThemeOptions,
  MuiFormHelperTextThemeOptions,
  MuiInputLabelThemeOptions,
  MuiOutlinedInputThemeOptions,
  MuiRadioThemeOptions,
  MuiSwitchThemeOptions,
} from "./components/inputs";
import { MuiSelectThemeOptions } from "./components/inputs/mui-select-theme-options";
import {
  MuiDrawerThemeOptions,
  MuiMenuItemThemeOptions,
  MuiMenuThemeOptions,
} from "./components/navigation";
import { MuiCssBaselineThemeOptions } from "./components/utils";

export const components: Components<Theme> = {
  /** ===== INPUTS ===== */
  MuiButton: MuiButtonThemeOptions,
  MuiOutlinedInput: MuiOutlinedInputThemeOptions,
  MuiInputLabel: MuiInputLabelThemeOptions,
  MuiSwitch: MuiSwitchThemeOptions,
  MuiRadio: MuiRadioThemeOptions,
  MuiCheckbox: MuiCheckboxThemeOptions,
  MuiSelect: MuiSelectThemeOptions,
  MuiFormHelperText: MuiFormHelperTextThemeOptions,
  /** ===== DATA DISPLAY ===== */
  MuiChip: MuiChipThemeOptions,
  MuiIconButton: MuiIconButtonThemeOptions,
  MuiTooltip: MuiTooltipThemeOptions,
  MuiListItemButton: MuiListItemButtonThemeOptions,
  MuiListItemText: MuiListItemTextThemeOptions,
  MuiListItemSecondaryAction: MuiListItemSecondaryActionThemeOptions,

  /** ===== FEEDBACK ===== */
  MuiSkeleton: MuiSkeletonThemeOptions,

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
