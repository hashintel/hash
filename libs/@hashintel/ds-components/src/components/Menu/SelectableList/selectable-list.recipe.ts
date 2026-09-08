import { sva } from "@hashintel/ds-helpers/css";

import type { FormInputSize } from "../../../util/form-shared";

export const styles = sva({
  slots: [
    "content",
    "group",
    "groupLabel",
    "emptyContainer",
    "customItem",
    "scrollArea",
    "scrollSizer",
    "header",
    "footer",
  ],
  base: {
    content: {
      // A flex column so the header/footer can swap edges by placement when
      // swapHeaderFooterOnFlip is set. Children must not shrink, or long
      // lists would compress rows to fit maxHeight instead of scrolling.
      display: "flex",
      flexDirection: "column",
      "& > *": {
        flexShrink: "0",
      },
      "& > [data-selectable-list-scroll]": {
        flexShrink: "1",
      },
      padding: "[var(--selectable-list-content-padding)]",
      backgroundColor: "white",
      border: "1px solid {colors.bd.subtle}",
      borderRadius: "lg",
      boxShadow: "lg",
      outline: "0",
      maxHeight: "[var(--available-height)]",
      overflowY: "auto",
      scrollbarWidth: "[thin]",
      color: "fg.heading",
      minWidth: "[140px]",
      zIndex: "popover",
      transformOrigin: "var(--transform-origin)",
    },
    group: {
      width: "full",
      paddingY: "1",
      marginY: "1",
      borderTop: "1px solid {colors.neutral.s30}",
      borderBottom: "1px solid {colors.neutral.s30}",
      "&:first-child": {
        borderTopWidth: "0",
        marginTop: "0",
        paddingTop: "0",
      },
      "&:last-child": {
        borderBottomWidth: "0",
        marginBottom: "0",
        paddingBottom: "0",
      },
      // Collapse adjacent group borders so we don't get a double line
      "& + &": { borderTopWidth: "0" },
    },
    groupLabel: {
      color: "fg.subtle",
      fontWeight: "medium",
      textTransform: "uppercase",
      paddingX: "[var(--selectable-list-padding-x)]",
      userSelect: "none",
      width: "full",
    },
    emptyContainer: {
      textAlign: "center",
      color: "neutral.s80",
      padding: "1",
    },
    customItem: {
      width: "full",
      paddingX: "[var(--selectable-list-padding-x)]",
      paddingY: "[var(--selectable-list-padding-y)]",
    },
    scrollArea: {
      display: "flex",
      flexDirection: "column",
      // A tall header/footer may squeeze the scroll area, but no further
      // than 200px — or the list's natural height when that is smaller
      // (measured into the variable by the component). Any excess overflows
      // to the outer content instead.
      minHeight: "[min(200px, var(--selectable-list-items-height, 0px))]",
      overflowY: "auto",
      scrollbarWidth: "[thin]",
      "& > *": {
        flexShrink: "0",
      },
    },
    scrollSizer: {
      display: "flex",
      flexDirection: "column",
      "& > *": {
        flexShrink: "0",
      },
    },
    header: {
      width: "[min-content]",
      minWidth: "[100%]",
      boxSizing: "border-box",
      paddingX: "[var(--selectable-list-padding-x)]",
      paddingY: "[var(--selectable-list-padding-y)]",
      marginBottom: "1",
      // A search header brings its own full-bleed chrome (see searchRow)
      "&:has([data-selectable-list-search])": {
        marginBottom: "0",
      },
      // With swap-on-flip, an upward-opening dropdown puts the header on
      // the bottom edge (nearest the trigger)
      "[data-placement^='top'] &": {
        "&[data-selectable-list-swap-on-flip]": {
          order: "[1]",
          marginBottom: "0",
          marginTop: "1",
          "&:has([data-selectable-list-search])": {
            marginTop: "0",
          },
        },
      },
    },
    footer: {
      width: "[min-content]",
      minWidth: "[100%]",
      boxSizing: "border-box",
      paddingX: "[var(--selectable-list-padding-x)]",
      paddingY: "[var(--selectable-list-padding-y)]",
      marginTop: "1",
      "[data-placement^='top'] &": {
        "&[data-selectable-list-swap-on-flip]": {
          order: "[-1]",
          marginTop: "0",
          marginBottom: "1",
        },
      },
    },
  },
  variants: {
    size: {
      xxs: {
        content: {
          "--selectable-list-content-padding": "var(--spacing-0\\.5)",
          "--selectable-list-padding-x": "var(--spacing-1\\.5)",
          "--selectable-list-padding-y": "var(--spacing-0\\.5)",
        },
        groupLabel: {
          fontSize: "[9px]",
          lineHeight: "[10px]",
          paddingTop: "0.5",
          paddingBottom: "1.5",
        },
        emptyContainer: {
          fontSize: "[9px]",
          lineHeight: "[10px]",
        },
        customItem: {
          textStyle: "xxs",
        },
        header: {
          textStyle: "xxs",
        },
        footer: {
          textStyle: "xxs",
        },
      },
      xs: {
        content: {
          "--selectable-list-content-padding": "var(--spacing-0\\.5)",
          "--selectable-list-padding-x": "var(--spacing-2)",
          "--selectable-list-padding-y": "3px",
        },
        groupLabel: {
          textStyle: "xxs",
          paddingTop: "0.5",
          paddingBottom: "2",
        },
        emptyContainer: {
          textStyle: "xxs",
        },
        customItem: {
          textStyle: "xs",
        },
        header: {
          textStyle: "xs",
        },
        footer: {
          textStyle: "xs",
        },
      },
      sm: {
        content: {
          "--selectable-list-content-padding": "var(--spacing-1)",
          "--selectable-list-padding-x": "var(--spacing-2)",
          "--selectable-list-padding-y": "3px",
        },
        groupLabel: {
          textStyle: "xs",
          paddingTop: "1",
          paddingBottom: "2",
        },
        emptyContainer: {
          textStyle: "xs",
        },
        customItem: {
          textStyle: "sm",
        },
        header: {
          textStyle: "sm",
        },
        footer: {
          textStyle: "sm",
        },
      },
      md: {
        content: {
          "--selectable-list-content-padding": "var(--spacing-1)",
          "--selectable-list-padding-x": "var(--spacing-2\\.5)",
          "--selectable-list-padding-y": "4px",
        },
        groupLabel: {
          textStyle: "sm",
          paddingTop: "1.5",
          paddingBottom: "2.5",
        },
        emptyContainer: {
          textStyle: "sm",
        },
        customItem: {
          textStyle: "base",
        },
        header: {
          textStyle: "base",
        },
        footer: {
          textStyle: "base",
        },
      },
      lg: {
        content: {
          "--selectable-list-content-padding": "var(--spacing-1\\.5)",
          "--selectable-list-padding-x": "var(--spacing-2\\.5)",
          "--selectable-list-padding-y": "4px",
        },
        groupLabel: {
          textStyle: "sm",
          paddingTop: "1.5",
          paddingBottom: "2.5",
        },
        emptyContainer: {
          textStyle: "sm",
        },
        customItem: {
          textStyle: "base",
        },
        header: {
          textStyle: "base",
        },
        footer: {
          textStyle: "base",
        },
      },
    },
    component: {
      select: {
        content: {
          '&[data-state="open"]': {
            animation: "popoverIn 120ms ease-out",
          },
          '&[data-state="closed"]': {
            animation: "popoverOut 50ms ease-in",
          },
        },
      },
      menu: {
        content: {
          '&[data-state="open"]': {
            animation: "fadeIn 120ms ease-out",
          },
          '&[data-state="closed"]': {
            animation: "fadeOut 50ms ease-in",
          },
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});

// Matches the vertical padding of a menu
export const contentPaddingPx: Record<FormInputSize, number> = {
  xxs: 3,
  xs: 3,
  sm: 5,
  md: 5,
  lg: 7,
};
