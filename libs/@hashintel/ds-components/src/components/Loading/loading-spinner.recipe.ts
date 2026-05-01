import { cva } from "@hashintel/ds-helpers/css";

export const styles = cva({
  base: {
    animation: "rotateLeft 1.1s infinite linear",
    width: "var(--loading-spinner-size)",
    height: "var(--loading-spinner-size)",
  },
  variants: {
    size: {
      xs: { "--loading-spinner-size": "12px" },
      sm: { "--loading-spinner-size": "16px" },
      md: { "--loading-spinner-size": "24px" },
      lg: { "--loading-spinner-size": "32px" },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
