import { sva } from "@hashintel/ds-helpers/css";

export const selectRecipe = sva({
  slots: ["trigger", "value", "placeholder", "arrow"],
  base: {
    trigger: {
      display: "inline-flex",
      alignItems: "stretch",
      textAlign: "inherit",
      font: "inherit",
      cursor: "pointer",
      "&[data-disabled]": { cursor: "auto" },
      "&:focus": { outline: "none" },
    },
    value: {},
    placeholder: {
      color: "neutral.s80",
    },
    arrow: {
      alignSelf: "center",
      display: "inline-flex",
      alignItems: "center",
      paddingRight: "2",
      color: "neutral.s100",
      transition: "[transform 0.15s ease]",
      "[data-state='open'] &": {
        transform: "rotate(180deg)",
      },
    },
  },
  variants: {
    variant: {
      default: {},
      subtle: {
        arrow: {
          paddingRight: "0",
        },
      },
    },
  },
  defaultVariants: {
    variant: "default",
  },
});
