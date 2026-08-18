import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["helpIcon", "button"],
  base: {
    button: {
      position: "relative",
      whiteSpace: "nowrap",
      flexShrink: "0",
      width: "[1em]",
      height: "[1em]",
      color: "fg.subtle",
      display: "inline-block",
    },
    helpIcon: {
      position: "absolute",
      left: "0",
      width: "[100% !important]",
      minWidth: "[100% !important]",
      height: "[100% !important]",
    },
  },
  variants: {
    align: {
      top: {
        button: {
          top: "[-0.06em]",
          marginLeft: "[0.33em]",
          verticalAlign: "text-top",
        },
      },
      center: {
        button: {
          top: "[-0.055em]",
          marginLeft: "[0.34em]",
          verticalAlign: "middle",
        },
      },
    },
  },
  defaultVariants: {
    align: "top",
  },
});
