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
    },
    image: {
      position: "absolute",
      inset: "0",
      width: "full",
      height: "full",
      objectFit: "cover",
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
    variant: {
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
          "--avatar-size": "40px",
          "--avatar-radius": "0.5rem",
          fontSize: "base",
        },
      },
    },
    tone: {
      neutral: {
        root: {
          backgroundColor: "neutral.s20",
          color: "neutral.s80",
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
    // Resets intrinsic <button>/<a> styling and adds hover/press/focus feedback.
    // The overlay defaults to a darken tint, which reads on the light neutral
    // fill and on photos. Only a placeholder on the solid brand fill switches to
    // a lighten (see compoundVariants), where a darken would be invisible. An
    // avatar showing an image always darkens regardless of tone, since the photo
    // hides the tone fill — so image hover stays consistent across tones.
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
          // White-separated halo: the inner white ring keeps the focus indicator
          // legible against the avatar (incl. the brand blue) and the outer blue
          // against the page — on any background. The transparent outline keeps a
          // ring visible under forced-colors mode, where box-shadow is dropped.
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
    // Whether an image is currently displayed (vs a placeholder). Drives the
    // brand-tone hover exception below.
    hasImage: {
      true: {},
      false: {},
    },
  },
  compoundVariants: [
    // Placeholder on the solid brand fill: a darken is invisible there, so
    // lighten instead. An avatar showing an image keeps the default darken.
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
