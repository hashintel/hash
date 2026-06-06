import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: [
    "content",
    "group",
    "groupLabel",
    "loadingContainer",
    "emptyContainer",
  ],
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
      minWidth: "[180px]",
      zIndex: "popover",
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
    loadingContainer: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "full",
      color: "fg.subtle",
      paddingX: "2",
      paddingY: "3",
    },
    emptyContainer: {
      textAlign: "center",
      padding: "3",
      color: "neutral.s80",
      textStyle: "sm",
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
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
