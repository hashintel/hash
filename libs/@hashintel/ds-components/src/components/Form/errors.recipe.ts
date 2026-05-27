import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["error", "icon"],
  base: {
    error: {
      display: "flex",
      alignItems: "center",
      gap: "1",
      color: "red.s100",
      fontFamily: "body",
      fontWeight: "normal",
      textStyle: "xs",
    },
    icon: {
      flexShrink: "0",
      width: "[1em]",
      minWidth: "[1em]",
      height: "[1em]",
    },
  },
  variants: {
    size: {
      xxs: { error: { textStyle: "xxs" } },
      xs: { error: { textStyle: "xxs" } },
      sm: { error: { textStyle: "xs" } },
      md: { error: { textStyle: "xs" } },
      lg: { error: { textStyle: "sm" } },
    },
    direction: {
      left: { error: { textAlign: "left" } },
      right: { error: { textAlign: "right", justifyContent: "flex-end" } },
    },
    disabled: {
      true: {
        error: {
          color: "[color-mix(in srgb, {colors.red.s110}, white 40%)]",
        },
      },
    },
  },
});
