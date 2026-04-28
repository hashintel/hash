import { cva } from "@hashintel/ds-helpers/css";

export const styles = cva({
  base: {
    display: "inline-block",
    verticalAlign: "middle",
    width: "var(--icon-size)",
    minWidth: "var(--icon-size)",
    height: "var(--icon-size)",
  },
  variants: {
    size: {
      xs: { "--icon-size": "12px" },
      sm: { "--icon-size": "16px" },
      md: { "--icon-size": "24px" },
      lg: { "--icon-size": "32px" },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
