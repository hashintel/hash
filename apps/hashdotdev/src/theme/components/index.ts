/* eslint-disable canonical/filename-no-index -- @todo rename file */

import { ThemeOptions } from "@mui/material";

import { MuiAvatarThemeOptions } from "./data-display/mui-avatar-theme-options";
import { MuiIconButtonThemeOptions } from "./data-display/mui-icon-button-theme-options";
import { MuiIconThemeOptions } from "./data-display/mui-icon-theme-options";
import { MuiTooltipThemeOptions } from "./data-display/mui-tooltip-theme-options";
import { MuiTypographyThemeOptions } from "./data-display/mui-typography-theme-options";
import { MuiButtonThemeOptions } from "./inputs/mui-button-theme-options";
import { MuiFormControlThemeOptions } from "./inputs/mui-form-control-theme-options";
import { MuiInputBaseThemeOptions } from "./inputs/mui-input-base-theme-options";
import { MuiOutlinedInputThemeOptions } from "./inputs/mui-outlined-input-theme-options";
import { MuiTextFieldThemeOptions } from "./inputs/mui-text-field-theme-options";
import { MuiContainerThemeOptions } from "./layout/mui-container-theme-options";
import { MuiLinkThemeOptions } from "./navigation/mui-link-theme-options";
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
};
