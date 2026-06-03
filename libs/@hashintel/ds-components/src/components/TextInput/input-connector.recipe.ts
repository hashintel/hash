import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["connector"],
  base: {
    connector: {
      position: "relative",
      marginX: "[-1px]",
      zIndex: "1",
      color: "var(--colors-bd-solid)",
      fill: "white",
    },
  },
});
