import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["row"],
  base: {
    row: {
      display: "flex",
    },
  },
  variants: {
    gap: {
      default: {},
      large: {},
      extraLarge: {},
      spaceBetween: {},
      connected: {},
    },
    align: {
      bottom: {},
      center: {},
      top: {},
    },
    noWrap: {
      false: {
        row: {
          flexWrap: "wrap",
        },
      },
    },
  },
});
