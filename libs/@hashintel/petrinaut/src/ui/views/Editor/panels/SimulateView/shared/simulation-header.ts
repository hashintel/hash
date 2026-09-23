import { cva } from "@hashintel/ds-helpers/css";

export const simulationHeaderHeight = 52;

export const simulationHeaderStyle = cva({
  base: { minHeight: "[52px]", flexShrink: "0" },
  variants: {
    withDescription: {
      false: { height: "[52px]" },
    },
  },
  defaultVariants: { withDescription: false },
});
