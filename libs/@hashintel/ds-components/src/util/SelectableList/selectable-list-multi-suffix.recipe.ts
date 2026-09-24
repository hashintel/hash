import { css, cva } from "@hashintel/ds-helpers/css";

export const suffixDefaultContent = css({
  "[data-part='item']:hover &": {
    display: "none",
  },
});

export const onlyButton = cva({
  base: {
    display: "none",
    cursor: "pointer",
    fontWeight: "[500]",
    _hover: {
      textDecoration: "underline",
    },
    "[data-part='item']:hover &": {
      display: "inline-flex",
    },
  },
  variants: {
    tone: {
      neutral: {
        color: "neutral.s110",
        _hover: { color: "neutral.s125" },
      },
      brand: {
        color: "blue.s100",
        _hover: { color: "blue.s110" },
      },
    },
  },
  defaultVariants: { tone: "neutral" },
});
