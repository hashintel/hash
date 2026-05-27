import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["root", "error", "icon"],
  base: {
    root: {
      display: "flex",
      flexDirection: "column",
      gap: "0.5",
      width: "full",
      margin: "0",
      padding: "0",
      listStyle: "none",
    },
    error: {
      display: "flex",
      alignItems: "center",
      gap: "1",
      color: "red.fg.body",
      fontFamily: "body",
      fontWeight: "normal",
      textStyle: "xs",
    },
    icon: {
      flexShrink: "0",
      color: "red.fg.body",
      width: "[1em]",
      height: "[1em]",
    },
  },
  variants: {
    size: {
      xxs: { error: { textStyle: "xxs" } },
      xs: { error: { textStyle: "xs" } },
      sm: { error: { textStyle: "xs" } },
      md: { error: { textStyle: "xs" } },
      lg: { error: { textStyle: "sm" } },
    },
    direction: {
      left: { error: { textAlign: "left" } },
      right: { error: { textAlign: "right", justifyContent: "flex-end" } },
    },
  },
});
