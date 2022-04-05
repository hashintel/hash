import { ThemeOptions } from "@mui/material";

import { MuiFormControlThemeOptions } from "./inputs/MuiFormControlThemeOptions";
import { MuiInputBaseThemeOptions } from "./inputs/MuiInputBaseThemeOptions";
import { MuiOutlinedInputThemeOptions } from "./inputs/MuiOutlinedInputThemeOptions";
import { MuiTextFieldThemeOptions } from "./inputs/MuiTextFieldThemeOptions";
import { MuiButtonThemeOptions } from "./inputs/MuiButtonThemeOptions";

import { MuiTypographyThemeOptions } from "./dataDisplay/MuiTypographyThemeOptions";
import { MuiIconButtonThemeOptions } from "./dataDisplay/MuiIconButtonThemeOptions";
import { MuiIconThemeOptions } from "./dataDisplay/MuiIconThemeOptions";

import { MuiContainerThemeOptions } from "./layout/MuiContainerThemeOptions";

import { MuiLinkThemeOptions } from "./navigation/MuiLinkThemeOptions";

import { MuiCssBaselineThemeOptions } from "./utils/MuiCssBaselineThemeOptions";

export const components: ThemeOptions["components"] = {
  /** ===== INPUTS ==== */
  MuiButton: MuiButtonThemeOptions,
  MuiTextField: MuiTextFieldThemeOptions,
  MuiFormControl: MuiFormControlThemeOptions,
  MuiInputBase: MuiInputBaseThemeOptions,
  MuiOutlinedInput: MuiOutlinedInputThemeOptions,
  MuiTypography: MuiTypographyThemeOptions,
  MuiIconButton: MuiIconButtonThemeOptions,
  MuiIcon: MuiIconThemeOptions,
  MuiContainer: MuiContainerThemeOptions,
  MuiLink: MuiLinkThemeOptions,
  MuiCssBaseline: MuiCssBaselineThemeOptions,
};
