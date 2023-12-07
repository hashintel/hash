// @todo encode dark mode in the MUI theme / design system (for optional toggling on)

import { customColors } from "@hashintel/design-system/theme";

export const darkModeBorderColor = customColors.gray[90];
export const darkModeInputBackgroundColor = "#161616";
export const darkModeInputColor = customColors.gray[30];
export const darkModePlaceholderColor = customColors.gray[60];

export const lightModeBorderColor = customColors.gray[30];

export const borderColors = {
  borderColor: lightModeBorderColor,
  "@media (prefers-color-scheme: dark)": {
    borderColor: darkModeBorderColor,
  },
};
