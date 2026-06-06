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
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      backgroundColor: "white",
      border: "1px solid",
      borderColor: "bd.subtle",
      borderRadius: "lg",
      boxShadow: "lg",
      outline: "0",
      overflowY: "auto",
      color: "fg.heading",
      minWidth: "[180px]",
    },
    group: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
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
        group: { gap: "[1px]" },
        groupLabel: {
          fontSize: "[9px]",
          lineHeight: "[10px]",
          paddingY: "1",
          minHeight: "[18px]",
          gap: "1",
        },
        loadingContainer: { paddingX: "1", paddingY: "1.5" },
      },
      xs: {
        content: {
          padding: "0.5",
          "--selectable-list-padding-x": "var(--spacing-2)",
        },
        group: { gap: "[1px]" },
        groupLabel: {
          fontSize: "[10px]",
          lineHeight: "[10px]",
          paddingY: "1",
          minHeight: "[22px]",
          gap: "1.5",
        },
        loadingContainer: { paddingX: "1", paddingY: "2" },
      },
      sm: {
        content: {
          padding: "1",
          "--selectable-list-padding-x": "var(--spacing-2)",
        },
        group: { gap: "[1px]" },
        groupLabel: {
          fontSize: "[11px]",
          lineHeight: "[11px]",
          paddingY: "1.5",
          minHeight: "[26px]",
          gap: "2",
        },
        loadingContainer: { paddingX: "1.5", paddingY: "2.5" },
      },
      md: {
        content: {
          padding: "1",
          "--selectable-list-padding-x": "var(--spacing-2\\.5)",
        },
        group: { gap: "[1px]" },
        groupLabel: {
          fontSize: "xs",
          lineHeight: "[12px]",
          paddingY: "1.5",
          minHeight: "[28px]",
          gap: "2",
        },
        loadingContainer: { paddingX: "2", paddingY: "3" },
      },
      lg: {
        content: {
          padding: "1.5",
          "--selectable-list-padding-x": "var(--spacing-2\\.5)",
        },
        group: { gap: "[2px]" },
        groupLabel: {
          fontSize: "sm",
          lineHeight: "[14px]",
          paddingY: "2",
          minHeight: "[36px]",
          gap: "2.5",
        },
        loadingContainer: { paddingX: "2.5", paddingY: "4" },
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
