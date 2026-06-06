import { sva } from "@hashintel/ds-helpers/css";

import type { FormInputSize } from "../../util/form-shared";

export const styles = sva({
  slots: [
    "item",
    "textColumn",
    "text",
    "description",
    "indicatorBox",
    "checkboxControl",
    "radioControl",
    "radioDot",
  ],
  base: {
    item: {
      display: "flex",
      alignItems: "center",
      width: "full",
      cursor: "pointer",
      outline: "0",
      userSelect: "none",
      backgroundColor: "white.a65",
      color: "fg.heading",
      fontWeight: "medium",
      textDecoration: "none",
      overflow: "hidden",
      boxSizing: "border-box",
      transition: "[background-color 0.1s ease, color 0.1s ease]",

      "&[data-highlighted]": {
        backgroundColor: "neutral.a35",
      },
      "&[data-disabled]": {
        cursor: "not-allowed",
        opacity: "[0.5]",
      },
    },
    textColumn: {
      display: "flex",
      flexDirection: "column",
      flex: "1",
      minWidth: "0",
      alignItems: "flex-start",
      textAlign: "start",
    },
    text: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: "[100%]",
    },
    description: {
      color: "fg.subtle",
      fontWeight: "normal",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: "[100%]",
    },
    indicatorBox: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
    },
    checkboxControl: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid",
      borderColor: "bd.solid",
      borderRadius: "sm",
      backgroundColor: "white",
      color: "fg.onSolid",
      flexShrink: "0",
    },
    radioControl: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid",
      borderColor: "bd.solid",
      borderRadius: "full",
      backgroundColor: "white",
      flexShrink: "0",
    },
    radioDot: {
      borderRadius: "full",
      backgroundColor: "fg.heading",
    },
  },
  variants: {
    size: {
      xxs: {
        item: {
          fontSize: "xxs",
          lineHeight: "[10px]",
          gap: "1",
          paddingX: "1",
          paddingY: "0",
          minHeight: "[20px]",
          borderRadius: "sm",
        },
        description: { fontSize: "[9px]", marginTop: "0" },
        indicatorBox: { width: "[10px]", height: "[10px]" },
        checkboxControl: { width: "[10px]", height: "[10px]" },
        radioControl: { width: "[10px]", height: "[10px]" },
        radioDot: { width: "[4px]", height: "[4px]" },
      },
      xs: {
        item: {
          fontSize: "xxs",
          lineHeight: "[12px]",
          gap: "1.5",
          paddingX: "1.5",
          paddingY: "0",
          minHeight: "[24px]",
          borderRadius: "md",
        },
        description: { fontSize: "[10px]", marginTop: "0" },
        indicatorBox: { width: "[12px]", height: "[12px]" },
        checkboxControl: { width: "[12px]", height: "[12px]" },
        radioControl: { width: "[12px]", height: "[12px]" },
        radioDot: { width: "[5px]", height: "[5px]" },
      },
      sm: {
        item: {
          fontSize: "xs",
          lineHeight: "[13px]",
          gap: "2",
          paddingX: "1.5",
          paddingY: "0",
          minHeight: "[26px]",
          borderRadius: "md",
        },
        description: { fontSize: "[11px]", marginTop: "0.5" },
        indicatorBox: { width: "[14px]", height: "[14px]" },
        checkboxControl: { width: "[14px]", height: "[14px]" },
        radioControl: { width: "[14px]", height: "[14px]" },
        radioDot: { width: "[6px]", height: "[6px]" },
      },
      md: {
        item: {
          fontSize: "sm",
          lineHeight: "[14px]",
          gap: "2",
          paddingX: "2",
          paddingY: "0",
          minHeight: "[28px]",
          borderRadius: "lg",
        },
        description: { fontSize: "xs", marginTop: "0.5" },
        indicatorBox: { width: "[16px]", height: "[16px]" },
        checkboxControl: { width: "[16px]", height: "[16px]" },
        radioControl: { width: "[16px]", height: "[16px]" },
        radioDot: { width: "[6px]", height: "[6px]" },
      },
      lg: {
        item: {
          fontSize: "base",
          lineHeight: "[16px]",
          gap: "2.5",
          paddingX: "2.5",
          paddingY: "0",
          minHeight: "[36px]",
          borderRadius: "lg",
        },
        description: { fontSize: "sm", marginTop: "1" },
        indicatorBox: { width: "[20px]", height: "[20px]" },
        checkboxControl: { width: "[20px]", height: "[20px]" },
        radioControl: { width: "[20px]", height: "[20px]" },
        radioDot: { width: "[8px]", height: "[8px]" },
      },
    },
    tone: {
      neutral: { item: { color: "fg.heading" } },
      brand: { item: { color: "blue.s90" } },
      error: { item: { color: "red.s90" } },
    },
    highlighted: {
      true: {
        item: {
          backgroundColor: "blue.bg.surface",
          "&[data-highlighted]": {
            backgroundColor: "blue.bg.surface.hover",
          },
        },
      },
      false: {},
    },
    selected: {
      true: {
        checkboxControl: {
          backgroundColor: "fg.heading",
          borderColor: "fg.heading",
          color: "white",
        },
        radioControl: {
          borderColor: "fg.heading",
        },
      },
      false: {},
    },
  },
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
