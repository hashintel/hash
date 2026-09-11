import { sva } from "@hashintel/ds-helpers/css";

import type { FormInputSize } from "../form-shared";

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
      paddingX: "[var(--selectable-list-container-padding-x)]",
      paddingY: "[var(--selectable-list-container-padding-y)]",
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
      paddingX: "[var(--selectable-list-item-padding-x)]",
      userSelect: "none",
      width: "full",
    },
    emptyContainer: {
      textAlign: "center",
      color: "neutral.s80",
      padding: "1",
    },
    customItem: {
      // Flex, so inline-block children (e.g. a Button) don't pick up line-box
      // leading from the row's line-height. Centered rather than stretched to
      // leave the children's heights alone.
      display: "flex",
      alignItems: "center",
      width: "full",
      paddingX: "[var(--selectable-list-item-padding-x)]",
      paddingY: "[var(--selectable-list-item-padding-y)]",
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
      paddingX: "[var(--selectable-list-item-padding-x)]",
      paddingY: "[var(--selectable-list-header-footer-padding-y)]",
      "[data-placement^='top'] &": {
        "&[data-selectable-list-swap-on-flip]": {
          order: "[1]",
        },
      },
    },
    footer: {
      width: "[min-content]",
      minWidth: "[100%]",
      boxSizing: "border-box",
      paddingX: "[var(--selectable-list-item-padding-x)]",
      paddingY: "[var(--selectable-list-header-footer-padding-y)]",
      "[data-placement^='top'] &": {
        "&[data-selectable-list-swap-on-flip]": {
          order: "[-1]",
        },
      },
    },
  },
  variants: {
    size: {
      xxs: {
        content: {
          "--selectable-list-container-padding-x": "var(--spacing-0\\.5)",
          "--selectable-list-container-padding-y": "var(--spacing-0\\.5)",
          "--selectable-list-item-padding-x": "var(--spacing-1\\.5)",
          "--selectable-list-item-padding-y": "var(--spacing-0\\.5)",
          "--selectable-list-header-footer-padding-y": "var(--spacing-1)",
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
          "--selectable-list-container-padding-x": "var(--spacing-0\\.5)",
          "--selectable-list-container-padding-y": "var(--spacing-0\\.5)",
          "--selectable-list-item-padding-x": "var(--spacing-2)",
          "--selectable-list-item-padding-y": "3px",
          "--selectable-list-header-footer-padding-y": "5px",
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
          "--selectable-list-container-padding-x": "var(--spacing-1)",
          "--selectable-list-container-padding-y": "var(--spacing-1)",
          "--selectable-list-item-padding-x": "var(--spacing-2)",
          "--selectable-list-item-padding-y": "3px",
          "--selectable-list-header-footer-padding-y": "5px",
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
          "--selectable-list-container-padding-x": "var(--spacing-1)",
          "--selectable-list-container-padding-y": "var(--spacing-1)",
          "--selectable-list-item-padding-x": "var(--spacing-2\\.5)",
          "--selectable-list-item-padding-y": "4px",
          "--selectable-list-header-footer-padding-y": "6px",
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
          "--selectable-list-container-padding-x": "var(--spacing-1\\.5)",
          "--selectable-list-container-padding-y": "var(--spacing-1\\.5)",
          "--selectable-list-item-padding-x": "var(--spacing-2\\.5)",
          "--selectable-list-item-padding-y": "4px",
          "--selectable-list-header-footer-padding-y": "6px",
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
