import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["description"],
  base: {
    description: {},
  },
  variants: {
    size: {
      xxs: {
        description: {},
      },
      xs: {
        description: {},
      },
      sm: {
        description: {},
      },
      md: {
        description: {},
      },
      lg: {
        description: {},
      },
    },
    direction: {
      left: {
        description: {},
      },
      right: {
        description: {},
      },
    },
    disabled: {
      true: {
        description: {},
      },
    },
  },
});
