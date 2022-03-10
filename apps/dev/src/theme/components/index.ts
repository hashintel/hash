import { ThemeOptions } from "@mui/material";

import { MuiFormControlThemeOptions } from "./inputs/MuiFormControlThemeOptions";
import { MuiInputLabelThemeOptions } from "./inputs/MuiInputLabelThemeOptions";
import { MuiInputBaseThemeOptions } from "./inputs/MuiInputBaseThemeOptions";
import { MuiOutlinedInputThemeOptions } from "./inputs/MuiOutlinedInputThemeOptions";
import { MuiTextFieldThemeOptions } from "./inputs/MuiTextFieldThemeOptions";
import { MuiButtonThemeOptions } from "./inputs/MuiButtonThemeOptions";
import { MuiCheckboxThemeOptions } from "./inputs/MuiCheckboxThemeOptions";

import { MuiTypographyThemeOptions } from "./dataDisplay/MuiTypographyThemeOptions";
import { MuiIconButtonThemeOptions } from "./dataDisplay/MuiIconButtonThemeOptions";
import { MuiIconThemeOptions } from "./dataDisplay/MuiIconThemeOptions";
import { MuiListItemButtonThemeOptions } from "./dataDisplay/MuiListItemButtonThemeOptions";
import { MuiListItemIconThemeOptions } from "./dataDisplay/MuiListItemIconThemeOptions";
import { MuiListItemTextThemeOptions } from "./dataDisplay/MuiListItemTextThemeOptions";

import { MuiPaperThemeOptions } from "./surfaces/MuiPaperThemeOptions";

import { MuiContainerThemeOptions } from "./layout/MuiContainerThemeOptions";

import { MuiBreadcrumbsThemeOptions } from "./navigation/MuiBreadcrumbsThemeOptions";
import { MuiLinkThemeOptions } from "./navigation/MuiLinkThemeOptions";
import { MuiTabsThemeOptions } from "./navigation/MuiTabsThemeOptions";
import { MuiTabThemeOptions } from "./navigation/MuiTabThemeOptions";

import { MuiSkeletonThemeOptions } from "./feedback/MuiSkeletonThemeOptions";

import { MuiCssBaselineThemeOptions } from "./utils/MuiCssBaselineThemeOptions";

export const components: ThemeOptions["components"] = {
  /** ===== INPUTS ==== */
  MuiButton: MuiButtonThemeOptions,
  MuiCheckbox: MuiCheckboxThemeOptions,
  MuiTextField: MuiTextFieldThemeOptions,
  MuiFormControl: MuiFormControlThemeOptions,
  MuiInputLabel: MuiInputLabelThemeOptions,
  MuiInputBase: MuiInputBaseThemeOptions,
  MuiOutlinedInput: MuiOutlinedInputThemeOptions,

  /** ===== DATA DISPLAY ===== */
  MuiTypography: MuiTypographyThemeOptions,
  MuiIconButton: MuiIconButtonThemeOptions,
  MuiIcon: MuiIconThemeOptions,
  MuiListItemButton: MuiListItemButtonThemeOptions,
  MuiListItemIcon: MuiListItemIconThemeOptions,
  MuiListItemText: MuiListItemTextThemeOptions,

  /** ===== SURFACES ===== */
  MuiPaper: MuiPaperThemeOptions,

  /** ===== LAYOUT ===== */
  MuiContainer: MuiContainerThemeOptions,

  /** ===== NAVIGATION ===== */
  MuiBreadcrumbs: MuiBreadcrumbsThemeOptions,
  MuiLink: MuiLinkThemeOptions,
  MuiTabs: MuiTabsThemeOptions,
  MuiTab: MuiTabThemeOptions,

  /** ===== FEEDBACK ===== */
  MuiSkeleton: MuiSkeletonThemeOptions,

  /** ===== UTILS ===== */
  MuiCssBaseline: MuiCssBaselineThemeOptions,
};
