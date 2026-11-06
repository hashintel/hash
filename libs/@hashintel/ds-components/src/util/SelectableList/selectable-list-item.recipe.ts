import { sva } from "@hashintel/ds-helpers/css";

import type { FormInputSize } from "../form-shared";

export const styles = sva({
  slots: [
    "item",
    "textColumn",
    "customText",
    "description",
    "indicator",
    "tick",
    "checkbox",
    "radio",
    "spinner",
    "icon",
    "suffix",
    "arrow",
    "collapseHit",
    "collapseChevron",
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
      paddingX: "[var(--selectable-list-item-padding-x)]",
      paddingY: "[var(--selectable-list-item-padding-y)]",

      "&[data-highlighted]": {
        backgroundColor: "neutral.a35",
        "--item-bg": "{colors.neutral.s35}",
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
    // Non-string item text gets this flex wrapper so inline-block content
    // doesn't pick up line-box leading (plain strings keep the ellipsis).
    customText: {
      display: "flex",
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
      fontSize: "[0.85em]",
      paddingLeft: "5",
    },
    arrow: {
      alignSelf: "center",
    },
    // The expand/collapse toggle's hit area: an invisible button wrapping the
    // row's leading columns (indent, chevron, selection indicator). The hit box spans from
    // the row's edge to where the label starts, over the row's full height.
    collapseHit: {
      display: "inline-flex",
      alignItems: "flex-start",
      gap: "[inherit]",
      border: "0",
      background: "[transparent]",
      cursor: "pointer",
      font: "[inherit]",
      alignSelf: "stretch",
      marginTop: "[calc(-1 * var(--selectable-list-item-padding-y))]",
      marginBottom: "[calc(-1 * var(--selectable-list-item-padding-y))]",
      marginLeft: "[calc(-1 * var(--selectable-list-item-padding-x))]",
      paddingTop: "[var(--selectable-list-item-padding-y)]",
      paddingBottom: "[var(--selectable-list-item-padding-y)]",
      paddingLeft: "[var(--selectable-list-item-padding-x)]",
    },
    collapseChevron: {
      position: "relative",
      color: "neutral.s110",
      borderRadius: "sm",
      transition:
        "[transform 0.15s ease, background-color 0.1s ease, box-shadow 0.1s ease]",
      "[data-collapsible-toggle]:hover &": {
        background: "neutral.a30",
        boxShadow: "[0 0 0 2px {colors.neutral.a30}]",
        color: "neutral.s120",
      },
      "[data-collapsible-toggle]:active &": {
        background: "neutral.a40",
        boxShadow: "[0 0 0 2px {colors.neutral.a40}]",
      },
      "&::before": {
        content: '""',
        position: "absolute",
        top: "[-2px]",
        right: "[-2px]",
        borderRadius: "full",
        backgroundColor: "fg.heading",
        boxShadow: "[0 0 0 1.5px {colors.white}]",
        opacity: "[0]",
        transition: "[opacity 0.1s ease]",
      },
    },
    tick: {},
    checkbox: {
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "bd.solid",
      borderRadius: "sm",
      backgroundColor: "white",
      color: "fg.onSolid",
    },
    radio: {
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "bd.solid",
      borderRadius: "full",
      backgroundColor: "white",
      color: "white",
      transition: "[background-color 0.07s ease, border-color 0.07s ease]",
      "&::after": {
        content: '""',
        borderRadius: "full",
        backgroundColor: "[currentColor]",
        opacity: "[0]",
        transition: "[opacity 0.07s ease]",
      },
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
          borderRadius: "sm",
        },
        collapseHit: { paddingRight: "1", marginRight: "-1" },
        collapseChevron: { "&::before": { width: "[4px]", height: "[4px]" } },
        radio: { "&::after": { width: "[4px]", height: "[4px]" } },
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
          borderRadius: "md",
        },
        collapseHit: { paddingRight: "1.5", marginRight: "-1.5" },
        collapseChevron: { "&::before": { width: "[5px]", height: "[5px]" } },
        radio: { "&::after": { width: "[5px]", height: "[5px]" } },
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
          borderRadius: "md",
        },
        collapseHit: { paddingRight: "1.5", marginRight: "-1.5" },
        collapseChevron: { "&::before": { width: "[5px]", height: "[5px]" } },
        radio: { "&::after": { width: "[6px]", height: "[6px]" } },
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
          borderRadius: "lg",
        },
        collapseHit: { paddingRight: "2", marginRight: "-2" },
        collapseChevron: { "&::before": { width: "[6px]", height: "[6px]" } },
        radio: { "&::after": { width: "[7px]", height: "[7px]" } },
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
          borderRadius: "lg",
        },
        collapseHit: { paddingRight: "2", marginRight: "-2" },
        collapseChevron: { "&::before": { width: "[6px]", height: "[6px]" } },
        radio: { "&::after": { width: "[7px]", height: "[7px]" } },
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
            "--item-bg": "{colors.neutral.s25}",
          },
        },
      },
      brand: {
        item: {
          color: "blue.s90",
          "&[data-highlighted]": {
            backgroundColor: "blue.a25",
            "--item-bg": "{colors.blue.s25}",
          },
        },
      },
      error: {
        item: {
          color: "red.s90",
          "&[data-highlighted]": {
            backgroundColor: "red.a25",
            "--item-bg": "{colors.red.s25}",
          },
        },
      },
    },
    selectedTone: {
      neutral: {},
      brand: {},
      error: {},
    },
    selectedStyle: {
      tick: {},
      checkbox: {},
      highlight: {},
      radio: {},
    },
    selected: {
      true: {
        checkbox: {
          backgroundColor: "fg.heading",
          borderColor: "fg.heading",
          color: "white",
        },
        radio: {
          backgroundColor: "fg.heading",
          borderColor: "fg.heading",
          "&::after": {
            opacity: "[1]",
          },
        },
      },
      false: {
        radio: {
          "[data-part=item][data-highlighted]:not(:has([data-collapsible-toggle]:hover)) &":
            {
              backgroundColor: "neutral.s50",
              borderColor: "neutral.s50",
              "&::after": {
                opacity: "[1]",
              },
            },
        },
      },
    },
    expanded: {
      true: {
        collapseChevron: {
          transform: "[rotate(90deg)]",
        },
      },
      false: {},
    },
    containsSelection: {
      true: {
        collapseChevron: {
          "&::before": {
            opacity: "[1]",
          },
        },
      },
      false: {},
    },
  },
  compoundVariants: [
    {
      selectedTone: "neutral",
      selectedStyle: "highlight",
      css: {
        item: {
          "&[data-highlighted]": {
            backgroundColor: "neutral.a25",
            "--item-bg": "{colors.neutral.s25}",
          },
        },
      },
    },
    {
      selectedTone: "brand",
      selectedStyle: "highlight",
      css: {
        item: {
          "&[data-highlighted]": {
            backgroundColor: "blue.a25",
            "--item-bg": "{colors.blue.s25}",
          },
        },
      },
    },
    {
      selectedTone: "error",
      selectedStyle: "highlight",
      css: {
        item: {
          "&[data-highlighted]": {
            backgroundColor: "red.a25",
            "--item-bg": "{colors.red.s25}",
          },
        },
      },
    },
    // A selected item keeps its darker background when highlighted by the
    // machine (opening the dropdown, keyboard navigation); only a pointer
    // hover lightens it. The `&[data-highlighted]` key matches the tone
    // variant's so the compound overrides it in the JS merge.
    {
      selectedTone: "neutral",
      selectedStyle: "highlight",
      selected: true,
      css: {
        item: {
          backgroundColor: "neutral.a35",
          "--item-bg": "{colors.neutral.s35}",
          "&[data-highlighted]": {
            backgroundColor: "neutral.a35",
            "--item-bg": "{colors.neutral.s35}",
          },
          "[data-highlight-navigated] &": {
            "&[data-highlighted]": {
              backgroundColor: "neutral.a25",
            },
          },
          "&[data-highlighted]:hover": {
            backgroundColor: "neutral.a25",
            "--item-bg": "{colors.neutral.s25}",
          },
        },
      },
    },
    {
      selectedTone: "brand",
      selectedStyle: "highlight",
      selected: true,
      css: {
        item: {
          backgroundColor: "blue.a40",
          "--item-bg": "{colors.blue.s40}",
          "&[data-highlighted]": {
            backgroundColor: "blue.a40",
            "--item-bg": "{colors.blue.s40}",
          },
          "[data-highlight-navigated] &": {
            "&[data-highlighted]": {
              backgroundColor: "blue.a30",
            },
          },
          "&[data-highlighted]:hover": {
            backgroundColor: "blue.a30",
            "--item-bg": "{colors.blue.s30}",
          },
        },
      },
    },
    {
      selectedTone: "error",
      selectedStyle: "highlight",
      selected: true,
      css: {
        item: {
          backgroundColor: "red.a40",
          "--item-bg": "{colors.red.s40}",
          "&[data-highlighted]": {
            backgroundColor: "red.a40",
            "--item-bg": "{colors.red.s40}",
          },
          "[data-highlight-navigated] &": {
            "&[data-highlighted]": {
              backgroundColor: "red.a30",
            },
          },
          "&[data-highlighted]:hover": {
            backgroundColor: "red.a30",
            "--item-bg": "{colors.red.s30}",
          },
        },
      },
    },
    {
      selectedTone: "neutral",
      selected: true,
      css: {
        tick: { color: "fg.heading" },
      },
    },
    {
      selectedTone: "brand",
      containsSelection: true,
      css: {
        collapseChevron: { "&::before": { backgroundColor: "blue.s90" } },
      },
    },
    {
      selectedTone: "error",
      containsSelection: true,
      css: {
        collapseChevron: { "&::before": { backgroundColor: "red.s90" } },
      },
    },
    {
      selectedTone: "brand",
      selected: true,
      css: {
        tick: { color: "blue.s90" },
        checkbox: {
          backgroundColor: "blue.s90",
          borderColor: "blue.s90",
        },
        radio: {
          backgroundColor: "blue.s90",
          borderColor: "blue.s90",
        },
      },
    },
    {
      selectedTone: "error",
      selected: true,
      css: {
        tick: { color: "red.s90" },
        checkbox: {
          backgroundColor: "red.s90",
          borderColor: "red.s90",
        },
        radio: {
          backgroundColor: "red.s90",
          borderColor: "red.s90",
        },
      },
    },
  ],
  defaultVariants: {
    as: "Menu",
    size: "md",
    tone: "neutral",
    selectedTone: "neutral",
    selectedStyle: "highlight",
    selected: false,
    expanded: false,
    containsSelection: false,
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
