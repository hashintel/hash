import { sva } from "@hashintel/ds-helpers/css";

import type { FormInputSize } from "../../../util/form-shared";

export const styles = sva({
  slots: ["content", "group", "groupLabel", "emptyContainer"],
  base: {
    content: {
      backgroundColor: "white",
      border: "1px solid",
      borderColor: "bd.subtle",
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
      borderTop: "1px solid",
      borderBottom: "1px solid",
      borderColor: "neutral.s30",
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
  },
  variants: {
    size: {
      xxs: {
        content: {
          padding: "0.5",
          "--selectable-list-padding-x": "var(--spacing-1\\.5)",
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
      },
      xs: {
        content: {
          padding: "0.5",
          "--selectable-list-padding-x": "var(--spacing-2)",
        },
        groupLabel: {
          textStyle: "xxs",
          paddingTop: "0.5",
          paddingBottom: "2",
        },
        emptyContainer: {
          textStyle: "xxs",
        },
      },
      sm: {
        content: {
          padding: "1",
          "--selectable-list-padding-x": "var(--spacing-2)",
        },
        groupLabel: {
          textStyle: "xs",
          paddingTop: "1",
          paddingBottom: "2",
        },
        emptyContainer: {
          textStyle: "xs",
        },
      },
      md: {
        content: {
          padding: "1",
          "--selectable-list-padding-x": "var(--spacing-2\\.5)",
        },
        groupLabel: {
          textStyle: "sm",
          paddingTop: "1.5",
          paddingBottom: "2.5",
        },
        emptyContainer: {
          textStyle: "sm",
        },
      },
      lg: {
        content: {
          padding: "1.5",
          "--selectable-list-padding-x": "var(--spacing-2\\.5)",
        },
        groupLabel: {
          textStyle: "sm",
          paddingTop: "1.5",
          paddingBottom: "2.5",
        },
        emptyContainer: {
          textStyle: "sm",
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
