/* eslint-disable canonical/filename-no-index -- @todo rename file */

import { ThemeOptions } from "@mui/material";

import { MuiAvatarThemeOptions } from "./data-display/mui-avatar-theme-options";
import { MuiIconButtonThemeOptions } from "./data-display/mui-icon-button-theme-options";
import { MuiIconThemeOptions } from "./data-display/mui-icon-theme-options";
import { MuiTooltipThemeOptions } from "./data-display/mui-tooltip-theme-options";
import { MuiTypographyThemeOptions } from "./data-display/mui-typography-theme-options";
import { MuiButtonThemeOptions } from "./inputs/mui-button-theme-options";
import { MuiCheckboxThemeOptions } from "./inputs/mui-checkbox-theme-options";
import { MuiFormControlThemeOptions } from "./inputs/mui-form-control-theme-options";
import { MuiInputBaseThemeOptions } from "./inputs/mui-input-base-theme-options";
import { MuiOutlinedInputThemeOptions } from "./inputs/mui-outlined-input-theme-options";
import { MuiTextFieldThemeOptions } from "./inputs/mui-text-field-theme-options";
import { MuiContainerThemeOptions } from "./layout/mui-container-theme-options";
import { MuiSvgIconThemeOptions } from "./mui-svg-icon-theme-overrides";
import { MuiLinkThemeOptions } from "./navigation/mui-link-theme-options";
import { MuiListItemButtonThemeOptions } from "./navigation/mui-list-item-button-theme-options";
import { MuiListItemIconThemeOptions } from "./navigation/mui-list-item-icon-theme-overrides";
import { MuiListItemTextThemeOptions } from "./navigation/mui-list-item-text-theme-overrides";
import { MuiListThemeOptions } from "./navigation/mui-list-theme-overrides";
import { MuiMenuItemThemeOptions } from "./navigation/mui-menu-item-theme-overrides";
import { MuiTabItemThemeOptions } from "./navigation/mui-tab-theme-options";
import { MuiTabsItemThemeOptions } from "./navigation/mui-tabs-theme-options";
import { MuiPaperThemeOptions } from "./surfaces/mui-paper-theme-options";
import { MuiCssBaselineThemeOptions } from "./utils/mui-css-baseline-theme-options";

export const components: ThemeOptions["components"] = {
  MuiAvatar: MuiAvatarThemeOptions,
  MuiButton: MuiButtonThemeOptions,
  MuiTextField: MuiTextFieldThemeOptions,
  MuiFormControl: MuiFormControlThemeOptions,
  MuiInputBase: MuiInputBaseThemeOptions,
  MuiOutlinedInput: MuiOutlinedInputThemeOptions,
  MuiTooltip: MuiTooltipThemeOptions,
  MuiTypography: MuiTypographyThemeOptions,
  MuiIconButton: MuiIconButtonThemeOptions,
  MuiIcon: MuiIconThemeOptions,
  MuiContainer: MuiContainerThemeOptions,
  MuiLink: MuiLinkThemeOptions,
  MuiCssBaseline: MuiCssBaselineThemeOptions,
  MuiList: MuiListThemeOptions,
  MuiMenuItem: MuiMenuItemThemeOptions,
  MuiListItemButton: MuiListItemButtonThemeOptions,
  MuiListItemText: MuiListItemTextThemeOptions,
  MuiListItemIcon: MuiListItemIconThemeOptions,
  MuiCheckbox: MuiCheckboxThemeOptions,
  MuiTabs: MuiTabsItemThemeOptions,
  MuiTab: MuiTabItemThemeOptions,
  MuiSvgIcon: MuiSvgIconThemeOptions,
  MuiPaper: MuiPaperThemeOptions,
};
