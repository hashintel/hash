import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["root"],
  base: {
    root: {
      position: "relative",
      marginX: "[-1px]",
      zIndex: "[1]",
      width: "[10px]",
      flex: "[0 0 auto]",
      color: "var(--colors-neutral-s40)",
      strokeWidth: "1px",
      fill: "white",
    },
  },
  variants: {
    disabled: {
      true: {
        root: {
          color: "var(--colors-neutral-a50)",
          fill: "neutral.s20",
        },
      },
    },
    invalid: {
      true: {
        root: {
          color: "var(--colors-red-s60)",
        },
      },
    },
    size: {
      xxs: {
        root: {
          width: "[6px]",
        },
      },
      xs: {
        root: {
          width: "[7px]",
        },
      },
      sm: {
        root: {
          width: "[8px]",
        },
      },
      md: {
        root: {
          width: "[10px]",
        },
      },
      lg: {
        root: {
          width: "[12px]",
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
