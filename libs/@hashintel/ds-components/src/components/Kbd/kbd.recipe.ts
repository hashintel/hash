import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["root", "label", "keycap", "key"],
  base: {
    root: {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      flexShrink: "0",
      height: "[1lh]",
      verticalAlign: "top",
      whiteSpace: "nowrap",
      "--kbd-key-size": "round(1.53em, 1px)",
    },
    label: {
      position: "absolute",
      width: "[1px]",
      height: "[1px]",
      overflow: "clip",
      clipPath: "inset(50%)",
      whiteSpace: "nowrap",
      userSelect: "none",
    },
    keycap: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      boxSizing: "border-box",
      minWidth: "[round(1.8em, 1px)]",
      height: "[round(1.8em, 1px)]",
      paddingInline: "[0.4em]",
      fontFamily: "body",
      fontSize: "[0.85em]",
      fontWeight: "[450]",
      lineHeight: "[1]",
      borderWidth: "[1px]",
      borderStyle: "solid",
      borderRadius: "sm",
    },
    key: {
      fontFamily: "body",
      fontSize: "[1em]",
    },
  },
  variants: {
    variant: {
      neutral: {
        keycap: {
          color: "neutral.s110",
          backgroundColor: "bg.surface",
          borderColor: "bd.solid",
        },
      },
      inherit: {
        keycap: {
          color: "[inherit]",
          backgroundColor:
            "[color-mix(in srgb, currentColor 10%, transparent)]",
          borderColor: "[color-mix(in srgb, currentColor 30%, transparent)]",
        },
      },
    },
    platform: {
      apple: { keycap: { gap: "[0.3em]" } },
      pc: { keycap: { gap: "0" } },
    },
  },
  defaultVariants: {
    variant: "neutral",
    platform: "pc",
  },
});
