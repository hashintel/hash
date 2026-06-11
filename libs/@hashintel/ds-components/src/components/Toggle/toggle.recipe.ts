import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["root", "control", "thumb", "label"],
  base: {
    root: {
      display: "inline-flex",
      alignItems: "center",
      gap: "[8px]",
      cursor: "pointer",
      userSelect: "none",
      "&[data-disabled]": {
        cursor: "not-allowed",
        opacity: "[0.5]",
      },
    },
    control: {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      flexShrink: "0",
      width: "var(--toggle-width)",
      height: "var(--toggle-height)",
      padding: "var(--toggle-padding)",
      borderRadius: "full",
      backgroundColor: "neutral.s40",
      transition:
        "[background-color 0.15s ease, outline-color 0.15s ease, box-shadow 0.15s ease]",
      "&[data-state='unchecked']:hover:not([data-disabled])": {
        backgroundColor: "neutral.s50",
      },
      "&:has(~ input:focus-visible)": {
        outline: "[2px solid]",
        outlineOffset: "[2px]",
        outlineColor: "black.a60",
      },
    },
    thumb: {
      width: "var(--toggle-thumb-size)",
      height: "var(--toggle-thumb-size)",
      borderRadius: "full",
      backgroundColor: "white",
      boxShadow: "[0 1px 2px rgba(0, 0, 0, 0.25)]",
      transition: "[transform 0.18s ease]",
      "&[data-state='checked']": {
        transform:
          "[translateX(calc(var(--toggle-width) - var(--toggle-thumb-size) - var(--toggle-padding) * 2))]",
      },
    },
    label: {
      fontWeight: "medium",
      color: "fg.heading",
      whiteSpace: "nowrap",
    },
  },
  variants: {
    size: {
      xxs: {
        control: {
          "--toggle-width": "[20px]",
          "--toggle-height": "[12px]",
          "--toggle-padding": "[2px]",
          "--toggle-thumb-size": "[8px]",
        },
        label: { fontSize: "[12px]" },
      },
      xs: {
        control: {
          "--toggle-width": "[24px]",
          "--toggle-height": "[14px]",
          "--toggle-padding": "[2px]",
          "--toggle-thumb-size": "[10px]",
        },
        label: { fontSize: "[12px]" },
      },
      sm: {
        control: {
          "--toggle-width": "[28px]",
          "--toggle-height": "[16px]",
          "--toggle-padding": "[2px]",
          "--toggle-thumb-size": "[12px]",
        },
        label: { fontSize: "[13px]" },
      },
      md: {
        control: {
          "--toggle-width": "[34px]",
          "--toggle-height": "[20px]",
          "--toggle-padding": "[2px]",
          "--toggle-thumb-size": "[16px]",
        },
        label: { fontSize: "[14px]" },
      },
      lg: {
        control: {
          "--toggle-width": "[42px]",
          "--toggle-height": "[24px]",
          "--toggle-padding": "[3px]",
          "--toggle-thumb-size": "[18px]",
        },
        label: { fontSize: "[16px]" },
      },
    },
    tone: {
      neutral: {
        control: {
          "&[data-state='checked']": {
            backgroundColor: "neutral.s120",
          },
          "&[data-state='checked']:hover:not([data-disabled])": {
            backgroundColor: "neutral.s110",
          },
          "&:has(~ input:focus-visible)": { outlineColor: "black.a60" },
        },
      },
      brand: {
        control: {
          "&[data-state='checked']": {
            backgroundColor: "blue.s90",
          },
          "&[data-state='checked']:hover:not([data-disabled])": {
            backgroundColor: "blue.s85",
          },
          "&:has(~ input:focus-visible)": { outlineColor: "blue.a60" },
        },
      },
      error: {
        control: {
          "&[data-state='checked']": {
            backgroundColor: "red.s90",
          },
          "&[data-state='checked']:hover:not([data-disabled])": {
            backgroundColor: "red.s85",
          },
          "&:has(~ input:focus-visible)": { outlineColor: "red.a60" },
        },
      },
    },
    invalid: {
      true: {
        control: {
          outline: "[2px solid]",
          outlineOffset: "[2px]",
          outlineColor: "red.s90",
        },
      },
      false: {},
    },
  },
  defaultVariants: {
    size: "md",
    tone: "neutral",
    invalid: false,
  },
});
