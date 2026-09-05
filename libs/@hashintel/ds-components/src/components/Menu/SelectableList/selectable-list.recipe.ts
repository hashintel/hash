import { sva } from "@hashintel/ds-helpers/css";

import type { FormInputSize } from "../../../util/form-shared";

export const styles = sva({
  slots: ["content", "group", "groupLabel", "emptyContainer", "customItem"],
  base: {
    content: {
      backgroundColor: "white",
      border: "1px solid {colors.bd.subtle}",
      borderRadius: "lg",
      boxShadow: "lg",
      outline: "0",
      maxHeight: "[var(--available-height)]",
      overflowY: "auto",
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
  },
  variants: {
    size: {
      xxs: {
        content: {
          padding: "0.5",
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
      },
      xs: {
        content: {
          padding: "0.5",
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
      },
      sm: {
        content: {
          padding: "1",
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
      },
      md: {
        content: {
          padding: "1",
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
      },
      lg: {
        content: {
          padding: "1.5",
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
