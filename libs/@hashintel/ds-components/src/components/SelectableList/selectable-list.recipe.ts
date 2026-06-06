import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["content", "group", "groupLabel"],
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
      overflow: "hidden",
      overflowY: "auto",
      color: "fg.heading",
      fontFamily: "body",
      minWidth: "[180px]",
    },
    group: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      width: "full",
      gap: "[1px]",
    },
    groupLabel: {
      display: "flex",
      alignItems: "center",
      color: "fg.subtle",
      fontWeight: "medium",
      textTransform: "uppercase",
      letterSpacing: "[0.04em]",
      userSelect: "none",
      width: "full",
    },
  },
  variants: {
    size: {
      xxs: {
        content: { padding: "0.5" },
        group: { gap: "[1px]" },
        groupLabel: {
          fontSize: "[9px]",
          lineHeight: "[10px]",
          paddingX: "1",
          paddingY: "1",
          minHeight: "[18px]",
          gap: "1",
        },
      },
      xs: {
        content: { padding: "0.5" },
        group: { gap: "[1px]" },
        groupLabel: {
          fontSize: "[10px]",
          lineHeight: "[10px]",
          paddingX: "1",
          paddingY: "1",
          minHeight: "[22px]",
          gap: "1.5",
        },
      },
      sm: {
        content: { padding: "1" },
        group: { gap: "[1px]" },
        groupLabel: {
          fontSize: "[11px]",
          lineHeight: "[11px]",
          paddingX: "1.5",
          paddingY: "1.5",
          minHeight: "[26px]",
          gap: "2",
        },
      },
      md: {
        content: { padding: "1" },
        group: { gap: "[1px]" },
        groupLabel: {
          fontSize: "xs",
          lineHeight: "[12px]",
          paddingX: "1.5",
          paddingY: "1.5",
          minHeight: "[28px]",
          gap: "2",
        },
      },
      lg: {
        content: { padding: "1.5" },
        group: { gap: "[2px]" },
        groupLabel: {
          fontSize: "sm",
          lineHeight: "[14px]",
          paddingX: "2",
          paddingY: "2",
          minHeight: "[36px]",
          gap: "2.5",
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
