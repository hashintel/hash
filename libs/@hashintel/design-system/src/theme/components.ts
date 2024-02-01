import { Components, Theme } from "@mui/material";

import {
  MuiIconButtonThemeOptions,
  MuiListItemButtonThemeOptions,
  MuiListItemSecondaryActionThemeOptions,
  MuiListItemTextThemeOptions,
  MuiTooltipThemeOptions,
} from "./components/data-display";
import { MuiChipThemeOptions } from "./components/data-display/mui-chip-theme-options";
import { MuiListItemIconThemeOptions } from "./components/data-display/mui-list-item-icon-theme-options";
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
import { MuiButtonBaseThemeOptions } from "./components/inputs/mui-button-base-theme-options";
import { MuiInputBaseThemeOptions } from "./components/inputs/mui-input-base-theme-options";
import { MuiSelectThemeOptions } from "./components/inputs/mui-select-theme-options";
import {
  MuiDrawerThemeOptions,
  MuiMenuItemThemeOptions,
  MuiMenuThemeOptions,
} from "./components/navigation";
import { MuiTabThemeOptions } from "./components/navigation/mui-tab-theme-options";
import { MuiTabsThemeOptions } from "./components/navigation/mui-tabs-theme-options";
import { MuiCssBaselineThemeOptions } from "./components/utils";

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
