import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["label", "tooltip", "required", "actions"],
  base: {
    label: {
      display: "flex",
      alignItems: "center",
      gap: "1.5",
      color: "fg.heading",
      fontFamily: "body",
      fontWeight: "medium",
      width: "full",
      margin: "0",
      padding: "0",
    },
    tooltip: {
      display: "inline-flex",
      flexShrink: "0",
      color: "fg.subtle",
      width: "[1em]",
      height: "[1em]",
      cursor: "help",
    },
    required: {
      display: "inline-flex",
      flexShrink: "0",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "blue.bg.subtle",
      color: "blue.fg.muted",
      borderRadius: "sm",
      width: "[1em]",
      height: "[1em]",
      _before: {
        content: '"*"',
        fontSize: "[0.85em]",
        fontWeight: "semibold",
      },
    },
    actions: {
      display: "inline-flex",
      alignItems: "center",
      gap: "1",
      marginLeft: "auto",
    },
  },
  variants: {
    size: {
      xxs: { label: { textStyle: "xxs" } },
      xs: { label: { textStyle: "xs" } },
      sm: { label: { textStyle: "sm" } },
      md: { label: { textStyle: "sm" } },
      lg: { label: { textStyle: "sm" } },
    },
    direction: {
      left: { label: { textAlign: "left" } },
      right: { label: { textAlign: "right", justifyContent: "flex-end" } },
    },
    disabled: {
      true: {
        label: { color: "fg.body.disabled" },
        tooltip: { color: "fg.subtle.disabled" },
        required: {
          backgroundColor: "neutral.bg.subtle",
          color: "fg.subtle.disabled",
        },
      },
    },
    hide: {
      true: {
        label: {
          position: "absolute",
          width: "[1px]",
          height: "[1px]",
          padding: "0",
          margin: "[-1px]",
          overflow: "hidden",
          clip: "[rect(0, 0, 0, 0)]",
          whiteSpace: "nowrap",
          borderWidth: "0",
        },
      },
    },
  },
});
