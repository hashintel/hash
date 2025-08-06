import type { Components, Theme } from "@mui/material";

import {
  MuiIconButtonThemeOptions,
  MuiListItemButtonThemeOptions,
  MuiListItemSecondaryActionThemeOptions,
  MuiListItemTextThemeOptions,
  MuiTooltipThemeOptions,
} from "./components/data-display.js";
import { MuiChipThemeOptions } from "./components/data-display/mui-chip-theme-options.js";
import { MuiListItemIconThemeOptions } from "./components/data-display/mui-list-item-icon-theme-options.js";
import { MuiSkeletonThemeOptions } from "./components/feedback/mui-skeleton-theme-options.js";
import {
  MuiButtonThemeOptions,
  MuiCheckboxThemeOptions,
  MuiFormHelperTextThemeOptions,
  MuiInputLabelThemeOptions,
  MuiOutlinedInputThemeOptions,
  MuiRadioThemeOptions,
  MuiSwitchThemeOptions,
} from "./components/inputs.js";
import { MuiButtonBaseThemeOptions } from "./components/inputs/mui-button-base-theme-options.js";
import { MuiInputBaseThemeOptions } from "./components/inputs/mui-input-base-theme-options.js";
import { MuiSelectThemeOptions } from "./components/inputs/mui-select-theme-options.js";
import {
  MuiDrawerThemeOptions,
  MuiMenuItemThemeOptions,
  MuiMenuThemeOptions,
} from "./components/navigation.js";
import { MuiTabThemeOptions } from "./components/navigation/mui-tab-theme-options.js";
import { MuiTabsThemeOptions } from "./components/navigation/mui-tabs-theme-options.js";
import { MuiCssBaselineThemeOptions } from "./components/utils.js";

export const components: Components<Theme> = {
  /** ===== INPUTS ===== */
  MuiButton: MuiButtonThemeOptions,
  MuiButtonBase: MuiButtonBaseThemeOptions,
  MuiOutlinedInput: MuiOutlinedInputThemeOptions,
  MuiInputLabel: MuiInputLabelThemeOptions,
  MuiSwitch: MuiSwitchThemeOptions,
  MuiRadio: MuiRadioThemeOptions,
  MuiCheckbox: MuiCheckboxThemeOptions,
  MuiSelect: MuiSelectThemeOptions,
  MuiFormHelperText: MuiFormHelperTextThemeOptions,
  MuiInputBase: MuiInputBaseThemeOptions,
  /** ===== DATA DISPLAY ===== */
  MuiChip: MuiChipThemeOptions,
  MuiIconButton: MuiIconButtonThemeOptions,
  MuiTooltip: MuiTooltipThemeOptions,
  MuiListItemButton: MuiListItemButtonThemeOptions,
  MuiListItemText: MuiListItemTextThemeOptions,
  MuiListItemIcon: MuiListItemIconThemeOptions,
  MuiListItemSecondaryAction: MuiListItemSecondaryActionThemeOptions,

  /** ===== FEEDBACK ===== */
  MuiSkeleton: MuiSkeletonThemeOptions,

  /** ===== SURFACES ===== */
  /** ===== NAVIGATION ===== */
  MuiDrawer: MuiDrawerThemeOptions,
  MuiMenu: MuiMenuThemeOptions,
  MuiMenuItem: MuiMenuItemThemeOptions,
  MuiTabs: MuiTabsThemeOptions,
  MuiTab: MuiTabThemeOptions,

  /** ===== LAYOUT ===== */
  /** ===== UTILS ===== */
  MuiCssBaseline: MuiCssBaselineThemeOptions,
  /** ===== DATA GRID ===== */
};
