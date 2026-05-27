import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["label", "tooltip", "required", "actions"],
  base: {
    label: {},
    tooltip: {},
    required: {},
    actions: {},
  },
  variants: {
    size: {
      xxs: {
        label: {},
      },
      xs: {
        label: {},
      },
      sm: {
        label: {},
      },
      md: {
        label: {},
      },
      lg: {
        label: {},
      },
    },
    direction: {
      left: {
        label: {},
      },
      right: {
        label: {},
      },
    },
    disabled: {
      true: {
        label: {},
      },
    },
    hide: {
      true: {
        label: {},
      },
    },
  },
});
