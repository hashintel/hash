import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["row"],
  base: {
    row: {
      display: "flex",
      width: "[100%]",
      rowGap: "8",

      "& > *": {
        flex: "[1 1 auto]",
        margin: "[0 !important]",
      },
    },
  },
  variants: {
    gap: {
      md: { row: { columnGap: "3.5" } },
      lg: { row: { columnGap: "6" } },
      xl: { row: { gap: "10" } },
      spaceBetween: {
        row: {
          gap: "10",
          justifyContent: "space-between",

          "& > *": {
            flexGrow: "0",
          },
        },
      },
      connected: {
        row: { gap: "0" },
      },
    },
    align: {
      bottom: { row: { alignItems: "flex-end" } },
      center: { row: { alignItems: "center" } },
      top: { row: { alignItems: "flex-start" } },
    },
  },
});
