import { cva } from "@hashintel/ds-helpers/css";

export const styles = cva({
  base: {
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
  variants: {
    variant: {
      circle: { borderRadius: "full" },
      square: { borderRadius: "[var(--avatar-radius)]" },
    },
    size: {
      xxs: {
        "--avatar-size": "16px",
        "--avatar-radius": "0.25rem",
        fontSize: "[8px]",
      },
      xs: {
        "--avatar-size": "20px",
        "--avatar-radius": "0.25rem",
        fontSize: "[9px]",
      },
      sm: {
        "--avatar-size": "24px",
        "--avatar-radius": "0.375rem",
        fontSize: "[11px]",
      },
      md: {
        "--avatar-size": "32px",
        "--avatar-radius": "0.375rem",
        fontSize: "sm",
      },
      lg: {
        "--avatar-size": "40px",
        "--avatar-radius": "0.5rem",
        fontSize: "base",
      },
    },
    tone: {
      neutral: {
        backgroundColor: "neutral.s20",
        color: "neutral.s80",
        borderColor: "bd.subtle",
      },
      brand: {
        backgroundColor: "blue.s100",
        color: "fg.onSolid",
        borderColor: "[white]",
      },
    },
    // Resets intrinsic <button>/<a> styling and adds a focus ring
    interactive: {
      true: {
        cursor: "pointer",
        appearance: "none",
        padding: "0",
        margin: "0",
        textDecoration: "none",
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "blue.a60",
          outlineOffset: "1",
        },
      },
      false: {},
    },
  },
  defaultVariants: {
    size: "md",
    tone: "neutral",
    interactive: false,
  },
});
