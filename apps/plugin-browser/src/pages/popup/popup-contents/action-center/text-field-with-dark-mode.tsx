import { TextField, TextFieldProps } from "@hashintel/design-system";
import { outlinedInputClasses } from "@mui/material";

export const TextFieldWithDarkMode = (props: TextFieldProps) => {
  return (
    <TextField
      {...props}
      InputProps={{
        sx: ({ palette }) => ({
          "@media (prefers-color-scheme: dark)": {
            background: "#161616",

            [`.${outlinedInputClasses.notchedOutline}`]: {
              border: `1px solid ${palette.gray[90]}`,
            },

            [`.${outlinedInputClasses.input}`]: {
              color: palette.gray[30],

              "&::placeholder": {
                color: `${palette.gray[60]} !important`,
              },
            },
          },
        }),
      }}
    />
  );
};
