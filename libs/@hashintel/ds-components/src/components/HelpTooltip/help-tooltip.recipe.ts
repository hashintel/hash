import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["helpIcon", "button"],
  base: {
    button: {
      position: "relative",
      marginLeft: "[0.33em]",
      whiteSpace: "nowrap",
      flexShrink: "0",
      top: "[-0.06em]",
      width: "[1em]",
      height: "[1em]",
      color: "fg.subtle",
      verticalAlign: "text-top",
    },
    helpIcon: {
      position: "absolute",
      left: "0",
      width: "[100% !important]",
      minWidth: "[100% !important]",
      height: "[100% !important]",
    },
  },
});
