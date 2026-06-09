import { sva } from "@hashintel/ds-helpers/css";

import type { FormInputSize } from "../../../util/form-shared";

export const styles = sva({
  slots: [
    "item",
    "textColumn",
    "description",
    "indicator",
    "tick",
    "checkbox",
    "spinner",
    "icon",
    "suffix",
    "arrow",
  ],
  base: {
    item: {
      display: "flex",
      alignItems: "flex-start",
      width: "full",
      cursor: "pointer",
      outline: "0",
      userSelect: "none",
      color: "fg.heading",
      fontWeight: "normal",
      textDecoration: "none",
      transition: "[background-color 0.1s ease, color 0.1s ease]",
      paddingX: "[var(--selectable-list-padding-x)]",

      "&[data-highlighted]": {
        backgroundColor: "neutral.a35",
      },
      "&[data-disabled]:not([data-loading])": {
        cursor: "default",
        opacity: "[0.5]",
      },
    },
    textColumn: {
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
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
    spinner: {
      color: "neutral.s90",
    },
    icon: {},
    suffix: {
      marginLeft: "auto",
      flexShrink: "0",
      color: "neutral.s80",
      alignSelf: "flex-start",
      fontWeight: "normal",
      fontSize: "[0.9em]",
      paddingLeft: "5",
    },
    arrow: {
      alignSelf: "center",
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
    as: {
      Menu: {
        item: {
          "& + &": {
            marginTop: "[1px]",
          },
        },
        textColumn: {
          fontWeight: "[450]",
        },
        description: {
          fontWeight: "normal",
        },
      },
      Select: {},
    },
    size: {
      xxs: {
        item: {
          textStyle: "xxs",
          gap: "1",
          paddingY: "0.5",
          borderRadius: "sm",
        },
        description: { fontSize: "[9px]", marginTop: "[-3px]" },
        indicator: {
          width: "[10px]",
          height: "[10px]",
          marginTop: "[calc((1lh - 10px) / 2)]",
        },
        icon: { marginTop: "[calc((1lh - 12px) / 2)]" },
        spinner: { marginTop: "[calc((1lh - 12px) / 2)]" },
      },
      xs: {
        item: {
          textStyle: "xs",
          gap: "1.5",
          paddingY: "[3px]",
          borderRadius: "md",
        },
        description: { textStyle: "xxs", marginTop: "-0.5" },
        indicator: {
          width: "[12px]",
          height: "[12px]",
          marginTop: "[calc((1lh - 12px) / 2)]",
        },
        icon: { marginTop: "[calc((1lh - 12px) / 2)]" },
        spinner: { marginTop: "[calc((1lh - 12px) / 2)]" },
      },
      sm: {
        item: {
          textStyle: "sm",
          gap: "1.5",
          paddingY: "[3px]",
          borderRadius: "md",
        },
        description: { textStyle: "xs", marginTop: "[-2px]" },
        indicator: {
          width: "[14px]",
          height: "[14px]",
          marginTop: "[calc((1lh - 14px) / 2)]",
        },
        icon: { marginTop: "[calc((1lh - 16px) / 2)]" },
        spinner: { marginTop: "[calc((1lh - 16px) / 2)]" },
      },
      md: {
        item: {
          textStyle: "base",
          gap: "2",
          paddingY: "[4px]",
          borderRadius: "lg",
        },
        description: { textStyle: "sm", marginTop: "[-3px]" },
        indicator: {
          width: "[16px]",
          height: "[16px]",
          marginTop: "[calc((1lh - 16px) / 2)]",
        },
        icon: { marginTop: "[calc((1lh - 24px) / 2)]" },
        spinner: { marginTop: "[calc((1lh - 24px) / 2)]" },
        tick: { marginX: "-0.5" },
      },
      lg: {
        item: {
          textStyle: "base",
          gap: "2",
          paddingY: "[4px]",
          borderRadius: "lg",
        },
        description: { textStyle: "sm", marginTop: "-0.5" },
        indicator: {
          width: "[16px]",
          height: "[16px]",
          marginTop: "[calc((1lh - 16px) / 2)]",
        },
        icon: { marginTop: "[calc((1lh - 24px) / 2)]" },
        spinner: { marginTop: "[calc((1lh - 24px) / 2)]" },
        tick: { marginX: "-0.5" },
      },
    },
    tone: {
      neutral: {
        item: {
          color: "fg.heading",
          "&[data-highlighted]": {
            backgroundColor: "neutral.a25",
          },
        },
      },
      brand: {
        item: {
          color: "blue.s90",
          "&[data-highlighted]": {
            backgroundColor: "blue.a30",
          },
        },
      },
      error: {
        item: {
          color: "red.s90",
          "&[data-highlighted]": {
            backgroundColor: "red.a30",
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
          backgroundColor: "neutral.a35",
        },
      },
    },
    {
      tone: "brand",
      highlighted: true,
      css: {
        item: {
          backgroundColor: "blue.a40",
        },
      },
    },
    {
      tone: "error",
      highlighted: true,
      css: {
        item: {
          backgroundColor: "red.a40",
        },
      },
    },
  ],
  defaultVariants: {
    as: "Menu",
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
  lg: 14,
};

export const checkIconSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xxs",
  xs: "xxs",
  sm: "xs",
  md: "xs",
  lg: "xs",
};

export const iconSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xs",
  xs: "xs",
  sm: "sm",
  md: "md",
  lg: "md",
};

export const arrowIconSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xxs",
  xs: "xxs",
  sm: "xs",
  md: "sm",
  lg: "sm",
};

export type ItemClasses = ReturnType<typeof styles>;
