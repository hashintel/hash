import { sva } from "@hashintel/ds-helpers/css";

import { srOnly } from "../../util/css-mixins";

// typography lives on root (not label) so the tooltip icon and required mark,
// which size themselves in em, share the label's font-size
export const styles = sva({
  slots: ["root", "label", "tooltip", "required", "actions"],
  base: {
    root: {
      display: "flex",
      alignItems: "center",
      color: "fg.body",
      fontWeight: "semibold",
      width: "full",
      margin: "0",
      padding: "0",
    },
    label: {
      display: "flex",
      alignItems: "center",
    },
    tooltip: {},
    required: {
      position: "relative",
      marginLeft: "[0.38em]",
      whiteSpace: "nowrap",
      flexShrink: "0",
      width: "[0.9em]",

      _before: {
        content: '"*"',
        display: "inline-flex",
        justifyContent: "center",
        width: "[100% !important]",
        height: "auto",
        aspectRatio: "1",
        fontSize: "[0.85em]",
        lineHeight: "[1.4]",
        fontWeight: "semibold",
        backgroundColor: "blue.bg.subtle",
        color: "blue.fg.muted",
        borderRadius: "sm",
      },
    },
    actions: {
      display: "inline-flex",
      alignItems: "center",
      gap: "1",
    },
  },
  variants: {
    size: {
      xxs: { root: { textStyle: "xxs" } },
      xs: { root: { textStyle: "xs" } },
      sm: { root: { textStyle: "sm" } },
      md: { root: { textStyle: "sm" } },
      lg: { root: { textStyle: "base" } },
    },
    direction: {
      left: { label: { textAlign: "left" }, actions: { marginLeft: "auto" } },
      right: {
        root: { justifyContent: "flex-end" },
        label: { textAlign: "right" },
        actions: {
          order: "-1",
          marginRight: "auto",
        },
      },
    },
    disabled: {
      true: {
        root: { color: "fg.body.disabled" },
        tooltip: { color: "fg.subtle.disabled" },
        required: {
          _before: {
            backgroundColor: "neutral.bg.subtle",
            color: "fg.subtle.disabled",
          },
        },
      },
    },
    hide: {
      true: {
        root: srOnly,
      },
    },
  },
});
