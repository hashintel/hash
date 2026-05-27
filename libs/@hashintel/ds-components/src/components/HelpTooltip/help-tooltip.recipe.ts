import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["helpIcon", "button"],
  base: {
    button: {
      position: "relative",
      marginLeft: "[4px]",
      whiteSpace: "nowrap",
      flexShrink: "0",
      top: "[0.01em]",
      width: "[1em]",
      color: "fg.subtle",
    },
    helpIcon: {
      width: "[100% !important]",
      minWidth: "[100% !important]",
      height: "auto",
      aspectRatio: "1",
      verticalAlign: "text-top",
    },
  },
});
