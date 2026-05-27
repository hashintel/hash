import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["error"],
  base: {
    error: {},
  },
  variants: {
    size: {
      xxs: {
        error: {},
      },
      xs: {
        error: {},
      },
      sm: {
        error: {},
      },
      md: {
        error: {},
      },
      lg: {
        error: {},
      },
    },
    direction: {
      left: {
        error: {},
      },
      right: {
        error: {},
      },
    },
    disabled: {
      true: {
        error: {},
      },
    },
  },
});
