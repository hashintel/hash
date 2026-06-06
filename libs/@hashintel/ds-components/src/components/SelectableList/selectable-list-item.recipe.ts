import { sva } from "@hashintel/ds-helpers/css";

import type { FormInputSize } from "../../util/form-shared";

export const styles = sva({
  slots: ["item", "textColumn", "description", "indicator", "tick", "checkbox"],
  base: {
    item: {
      display: "flex",
      alignItems: "center",
      width: "full",
      cursor: "pointer",
      outline: "0",
      userSelect: "none",
      color: "fg.heading",
      fontWeight: "normal",
      textDecoration: "none",
      transition: "[background-color 0.1s ease, color 0.1s ease]",

      "&[data-highlighted]": {
        backgroundColor: "neutral.a35",
      },
      "&[data-disabled]": {
        cursor: "default",
        opacity: "[0.5]",
      },
    },
    textColumn: {
      minWidth: "0",
    },
    description: {
      display: "block",
      color: "fg.subtle",
    },
    indicator: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
    },
    tick: {},
    checkbox: {
      border: "1px solid",
      borderColor: "bd.solid",
      borderRadius: "sm",
      backgroundColor: "white",
      color: "fg.onSolid",
    },
  },
  variants: {
    size: {
      xxs: {
        item: {
          textStyle: "xxs",
          gap: "1",
          paddingX: "1",
          paddingY: "0",
          minHeight: "[20px]",
          borderRadius: "sm",
        },
        description: { fontSize: "[9px]", marginTop: "0" },
        indicator: { width: "[10px]", height: "[10px]" },
      },
      xs: {
        item: {
          textStyle: "xs",
          gap: "1.5",
          paddingX: "1.5",
          paddingY: "0",
          minHeight: "[24px]",
          borderRadius: "md",
        },
        description: { fontSize: "[10px]", marginTop: "0" },
        indicator: { width: "[12px]", height: "[12px]" },
      },
      sm: {
        item: {
          textStyle: "sm",
          gap: "2",
          paddingX: "1.5",
          paddingY: "0",
          minHeight: "[26px]",
          borderRadius: "md",
        },
        description: { fontSize: "[11px]", marginTop: "0.5" },
        indicator: { width: "[14px]", height: "[14px]" },
      },
      md: {
        item: {
          textStyle: "base",
          gap: "2",
          paddingX: "2",
          paddingY: "0",
          minHeight: "[28px]",
          borderRadius: "lg",
        },
        description: { fontSize: "xs", marginTop: "0.5" },
        indicator: { width: "[16px]", height: "[16px]" },
      },
      lg: {
        item: {
          textStyle: "base",
          gap: "2.5",
          paddingX: "2.5",
          paddingY: "0",
          minHeight: "[36px]",
          borderRadius: "lg",
        },
        description: { fontSize: "sm", marginTop: "1" },
        indicator: { width: "[20px]", height: "[20px]" },
      },
    },
    tone: {
      neutral: {
        item: {
          color: "fg.heading",
          "&[data-highlighted]": {
            backgroundColor: "neutral.a35",
          },
        },
      },
      brand: {
        item: {
          color: "blue.s90",
          "&[data-highlighted]": {
            backgroundColor: "blue.a35",
          },
        },
      },
      error: {
        item: {
          color: "red.s90",
          "&[data-highlighted]": {
            backgroundColor: "red.a35",
          },
        },
      },
    },
    highlighted: {
      true: {},
    },
    selected: {
      true: {
        checkbox: {
          backgroundColor: "fg.heading",
          borderColor: "fg.heading",
          color: "white",
        },
      },
    },
  },
  compoundVariants: [
    {
      tone: "neutral",
      highlighted: true,
      css: {
        item: {
          backgroundColor: "neutral.a50",
        },
      },
    },
    {
      tone: "brand",
      highlighted: true,
      css: {
        item: {
          backgroundColor: "blue.a50",
        },
      },
    },
    {
      tone: "error",
      highlighted: true,
      css: {
        item: {
          backgroundColor: "red.a50",
        },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    tone: "neutral",
    highlighted: false,
    selected: false,
  },
});

export const indentUnitPx: Record<FormInputSize, number> = {
  xxs: 8,
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
};

export const checkIconSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xxs",
  xs: "xxs",
  sm: "xs",
  md: "xs",
  lg: "xs",
};

export type ItemClasses = ReturnType<typeof styles>;
