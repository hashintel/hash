import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["root", "image", "placeholder", "initials"],
  base: {
    root: {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      overflow: "clip",
      userSelect: "none",
      verticalAlign: "middle",
      fontWeight: "medium",
      lineHeight: "none",
      borderWidth: "[1px]",
      borderStyle: "solid",
      width: "var(--avatar-size)",
      height: "var(--avatar-size)",
      minWidth: "var(--avatar-size)",
      // A loaded image gets the neutral fill and border on every tone
      "&[data-loaded='true']": {
        backgroundColor: "neutral.s20",
        borderColor: "bd.subtle",
      },
    },
    image: {
      position: "absolute",
      inset: "0",
      width: "full",
      height: "full",
      objectFit: "cover",
      // Transparent images (e.g. logos) render on white, not the tone fill.
      backgroundColor: "[white]",
      // Hidden until loaded so the placeholder — not a white box — shows while loading.
      opacity: "0",
      "&[data-loaded='true']": {
        opacity: "1",
      },
    },
    placeholder: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    },
    initials: {
      textTransform: "uppercase",
    },
  },
  variants: {
    shape: {
      circle: { root: { borderRadius: "full" } },
      square: { root: { borderRadius: "[var(--avatar-radius)]" } },
    },
    size: {
      xxs: {
        root: {
          "--avatar-size": "16px",
          "--avatar-radius": "0.25rem",
          fontSize: "[8px]",
        },
      },
      xs: {
        root: {
          "--avatar-size": "20px",
          "--avatar-radius": "0.25rem",
          fontSize: "[9px]",
        },
      },
      sm: {
        root: {
          "--avatar-size": "24px",
          "--avatar-radius": "0.375rem",
          fontSize: "[11px]",
        },
      },
      md: {
        root: {
          "--avatar-size": "32px",
          "--avatar-radius": "0.375rem",
          fontSize: "sm",
        },
      },
      lg: {
        root: {
          "--avatar-size": "48px",
          "--avatar-radius": "0.5rem",
          fontSize: "base",
        },
      },
    },
    tone: {
      neutral: {
        root: {
          backgroundColor: "neutral.s20",
          color: "neutral.s110",
          borderColor: "bd.subtle",
        },
      },
      brand: {
        root: {
          backgroundColor: "blue.s100",
          color: "fg.onSolid",
          borderColor: "[white]",
        },
      },
    },
    interactive: {
      true: {
        root: {
          cursor: "pointer",
          appearance: "none",
          padding: "0",
          margin: "0",
          textDecoration: "none",
          transition: "[transform 0.1s ease]",
          "&::after": {
            content: '""',
            position: "absolute",
            inset: "0",
            backgroundColor: "[transparent]",
            transition: "[background-color 0.12s ease]",
            pointerEvents: "none",
          },
          "&:hover::after": {
            backgroundColor: "neutral.a60",
          },
          "&:active::after": {
            backgroundColor: "neutral.a80",
          },
          "&:active": {
            transform: "[scale(0.99)]",
          },
          "&:focus-visible": {
            outline: "[2px solid transparent]",
            outlineOffset: "[2px]",
            boxShadow:
              "[0 0 0 2px var(--colors-white), 0 0 0 4px var(--colors-blue-s90)]",
          },
          _motionReduce: {
            transition: "[none]",
            "&::after": { transition: "[none]" },
            "&:active": { transform: "[none]" },
          },
        },
      },
      false: {},
    },
    hasImage: {
      true: {},
      false: {},
    },
  },
  compoundVariants: [
    {
      interactive: true,
      tone: "brand",
      hasImage: false,
      css: {
        root: {
          "&:hover::after": { backgroundColor: "[rgba(255,255,255,0.16)]" },
          "&:active::after": { backgroundColor: "[rgba(255,255,255,0.3)]" },
        },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    tone: "neutral",
    interactive: false,
    hasImage: false,
  },
});
