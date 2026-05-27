import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["description"],
  base: {
    description: {
      display: "block",
      color: "fg.subtle",
      fontFamily: "body",
      fontWeight: "normal",
      width: "full",
    },
  },
  variants: {
    size: {
      xxs: { description: { textStyle: "xxs" } },
      xs: { description: { textStyle: "xs" } },
      sm: { description: { textStyle: "xs" } },
      md: { description: { textStyle: "sm" } },
      lg: { description: { textStyle: "sm" } },
    },
    direction: {
      left: { description: { textAlign: "left" } },
      right: { description: { textAlign: "right" } },
    },
    disabled: {
      true: { description: { color: "fg.subtle.disabled" } },
    },
  },
});
