import { outlinedInputClasses } from "@mui/material";

import { TextField } from "@hashintel/design-system";

import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  darkModePlaceholderColor,
} from "../../../shared/style-values";

import type { TextFieldProps } from "@hashintel/design-system";

export const TextFieldWithDarkMode = (props: TextFieldProps) => {
  return (
    <TextField
      {...props}
      InputProps={{
        sx: () => ({
          "@media (prefers-color-scheme: dark)": {
            background: darkModeInputBackgroundColor,

            [`.${outlinedInputClasses.notchedOutline}`]: {
              border: `1px solid ${darkModeBorderColor}`,
            },

            [`.${outlinedInputClasses.input}`]: {
              color: darkModeInputColor,

              "&::placeholder": {
                color: `${darkModePlaceholderColor} !important`,
              },
            },
          },
        }),
      }}
    />
  );
};
