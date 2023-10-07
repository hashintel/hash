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

            // @todo figure out where these styles should be (not taking effect here)
            "::placeholder": {
              color: palette.gray[70],
            },
            color: palette.common.white,
          },
        }),
      }}
    />
  );
};
