import { sva } from "@hashintel/ds-helpers/css";

import { srOnly } from "../../util/css-mixins";

export const styles = sva({
  slots: ["label", "tooltip", "required", "actions"],
  base: {
    label: {
      display: "flex",
      alignItems: "center",
      color: "fg.body",
      fontWeight: "semibold",
      width: "full",
      margin: "0",
      padding: "0",
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
      xxs: { label: { textStyle: "xxs" } },
      xs: { label: { textStyle: "xs" } },
      sm: { label: { textStyle: "sm" } },
      md: { label: { textStyle: "sm" } },
      lg: { label: { textStyle: "base" } },
    },
    direction: {
      left: { label: { textAlign: "left" }, actions: { marginLeft: "auto" } },
      right: {
        label: { textAlign: "right", justifyContent: "flex-end" },
        actions: {
          order: "-1",
          marginRight: "auto",
        },
      },
    },
    disabled: {
      true: {
        label: { color: "fg.body.disabled" },
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
        label: srOnly,
      },
    },
  },
});
