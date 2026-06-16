import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["root", "control", "thumb", "label"],
  base: {
    root: {
      display: "inline-flex",
      width: "[fit-content]",
      alignItems: "center",
      gap: "[8px]",
      cursor: "pointer",
      userSelect: "none",
      "&[data-disabled]": {
        opacity: "0.7",
        cursor: "unset",
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
      border: "[1px solid]",
      borderColor: "black.a15",
      boxShadow: "[inset 0 2px 4px rgba(0, 0, 0, 0.05)]",
      outlineColor: "black.a40",
      transition:
        "[background-color 0.15s ease, outline 0.15s ease, box-shadow 0.15s ease]",
      "&:has(~ input:focus-visible)": {
        outline: "[2px solid var(--colors-black-a40)]",
        outlineOffset: "[2px]",
      },
      // On hover, subtly slide the thumb part-way towards the opposite state as
      // an affordance hinting that the toggle is interactive.
      "&[data-state='unchecked']:hover:not([data-disabled]) [data-part='thumb']":
        {
          transform:
            "[translateX(calc(var(--toggle-travel) * var(--toggle-hover-nudge)))]",
        },
      "&[data-state='checked']:hover:not([data-disabled]) [data-part='thumb']":
        {
          transform:
            "[translateX(calc(var(--toggle-travel) * (1 - var(--toggle-hover-nudge))))]",
        },
    },
    thumb: {
      "--toggle-travel":
        "[calc(var(--toggle-width) - var(--toggle-thumb-size) - var(--toggle-padding) * 2 - 2px)]",
      "--toggle-hover-nudge": "[0.07]",
      width: "var(--toggle-thumb-size)",
      height: "var(--toggle-thumb-size)",
      borderRadius: "full",
      backgroundColor: "white",
      boxShadow:
        "[0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)]",
      transition: "[transform 0.18s ease]",
      "&[data-state='checked']": {
        transform: "[translateX(var(--toggle-travel))]",
      },
      "&[data-disabled]": {
        backgroundColor: "neutral.s30 !important",
      },
      "&[data-disabled][data-state='unchecked']": {
        backgroundColor: "neutral.s25 !important",
        boxShadow:
          "[0 1px 3px 0 rgba(0, 0, 0, 0.15), 0 1px 2px -1px rgba(0, 0, 0, 0.15)]",
      },
    },
    label: {
      fontWeight: "medium",
      lineHeight: "[1]",
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
          "--toggle-thumb-size": "[14px]",
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
            backgroundColor: "neutral.s115",
          },
          "&[data-state='checked']:hover:not([data-disabled])": {
            backgroundColor: "neutral.s110",
          },
          "&[data-disabled][data-state='checked']": {
            backgroundColor: "neutral.s55 !important",
          },
        },
      },
      brand: {
        control: {
          "&[data-state='checked']": {
            backgroundColor: "blue.s85",
          },
          "&[data-state='checked']:hover:not([data-disabled])": {
            backgroundColor: "blue.s75",
          },
          "&[data-disabled][data-state='checked']": {
            backgroundColor: "blue.s55 !important",
          },
        },
      },
      success: {
        control: {
          "&[data-state='checked']": {
            backgroundColor: "green.s80",
          },
          "&[data-state='checked']:hover:not([data-disabled])": {
            backgroundColor: "green.s70",
          },
          "&[data-disabled][data-state='checked']": {
            backgroundColor: "green.s55 !important",
          },
        },
      },
    },
    offTone: {
      neutral: {
        control: {
          "&[data-state='unchecked']": {
            backgroundColor: "neutral.s30",
          },
          "&[data-state='unchecked']:hover:not([data-disabled])": {
            backgroundColor: "neutral.s40",
          },
          "&[data-disabled][data-state='unchecked']": {
            backgroundColor: "neutral.s30 !important",
          },
        },
      },
      error: {
        control: {
          "&[data-state='unchecked']": {
            backgroundColor: "red.s40",
          },
          "&[data-state='unchecked']:hover:not([data-disabled])": {
            backgroundColor: "red.s50",
          },
          "&[data-disabled][data-state='unchecked']": {
            backgroundColor: "red.s30 !important",
          },
        },
      },
    },
    invalid: {
      true: {
        control: {
          borderColor: "red.s70",
          "&::after": {
            content: '""',
            position: "absolute",
            inset: "0",
            borderRadius: "[inherit]",
            border: "[1px solid]",
            borderColor: "red.s70",
            pointerEvents: "none",
          },
        },
      },
      false: {},
    },
  },
  defaultVariants: {
    size: "md",
    tone: "neutral",
    offTone: "neutral",
    invalid: false,
  },
});
