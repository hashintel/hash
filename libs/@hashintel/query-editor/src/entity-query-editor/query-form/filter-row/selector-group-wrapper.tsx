import {
  formControlClasses,
  formHelperTextClasses,
  inputBaseClasses,
  outlinedInputClasses,
  Stack,
} from "@mui/material";
import { ReactNode } from "react";

export const SelectorGroupWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <Stack
      direction="row"
      sx={{
        flex: 1,
        minWidth: 0,
        fieldset: {
          boxShadow: "none !important",
        },

        [`.${formHelperTextClasses.root}`]: {
          position: "absolute",
          bottom: 0,
          transform: "translateY(100%)",
        },

        [`.${inputBaseClasses.root}`]: {
          borderRadius: 0,
          height: 38,
        },

        [`.${formControlClasses.root}`]: {
          [`:not(:last-child) .${outlinedInputClasses.notchedOutline}`]: {
            borderRight: "none",
          },

          [`:first-of-type .${inputBaseClasses.root}`]: {
            borderRadius: "6px 0 0 6px",
          },

          [`:last-child .${inputBaseClasses.root}`]: {
            borderRadius: "0 6px 6px 0",
          },
        },
      }}
    >
      {children}
    </Stack>
  );
};
