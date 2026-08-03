import { cva, sva } from "@hashintel/ds-helpers/css";

/**
 * Maps each avatar `size` to the `--avatar-size` custom property that drives an
 * avatar's box — its width, radius and border all derive from it.
 *
 * Shared so AvatarGroup can declare the same variable on its own root: the
 * group's stacking wrappers sit *above* the avatars in the tree, so they can't
 * read the `--avatar-size` each avatar sets on itself (custom properties only
 * inherit downward). The group applies this recipe to its root to expose the
 * value to those wrappers, keeping a single source of truth for the size scale.
 *
 * `custom` sets nothing — the consumer supplies `--avatar-size` directly.
 */
export const avatarSize = cva({
  variants: {
    size: {
      xxs: { "--avatar-size": "16px" },
      xs: { "--avatar-size": "20px" },
      sm: { "--avatar-size": "24px" },
      md: { "--avatar-size": "32px" },
      lg: { "--avatar-size": "48px" },
      custom: {},
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export const styles = sva({
  slots: ["root", "image", "placeholder", "initials", "icon"],
  base: {
    root: {
      "--avatar-radius":
        "min(calc(1.3px * sqrt(var(--avatar-size) / 1px)), calc(var(--avatar-size) * 0.35))",
      borderWidth: "[max(1px, min(calc(var(--avatar-size) / 32), 3px))]", // 1/32 of size (matches lg's 1.5px @ 48px), clamped 1px–3px
      borderStyle: "solid",
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      overflow: "clip",
      userSelect: "none",
      verticalAlign: "middle",
      fontWeight: "[470]",
      lineHeight: "none",
      width: "var(--avatar-size)",
      minWidth: "var(--avatar-size)",
      aspectRatio: "1",
      containerType: "inline-size",
      // A loaded image gets the neutral fill and border on every tone
      "&[data-loaded='true']": {
        backgroundColor: "neutral.s40",
        borderColor: "neutral.s40",
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
      fontSize: "[45cqw]",
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
      // `--avatar-size` for each size comes from the shared `avatarSize` recipe
      // (avatar-size.recipe.ts), applied to the root alongside these styles.
      xxs: {
        root: {
          "--avatar-radius": "0.25rem",
        },
        placeholder: {
          fontSize: "[7px]",
        },
      },
      xs: {
        root: {
          "--avatar-radius": "0.25rem",
        },
        placeholder: {
          fontSize: "[9px]",
        },
      },
      sm: {
        root: {
          "--avatar-radius": "0.375rem",
        },
        placeholder: {
          fontSize: "[11px]",
        },
      },
      md: {
        root: {
          "--avatar-radius": "0.375rem",
        },
        placeholder: {
          fontSize: "sm",
        },
      },
      lg: {
        root: {
          "--avatar-radius": "0.5rem",
        },
        placeholder: {
          fontSize: "[20px]",
        },
      },
      custom: {
        root: {},
        icon: {
          "&:is(svg)": {
            "--icon-size": "[51cqw]",
          },
        },
      },
    },
    tone: {
      neutral: {
        root: {
          backgroundColor: "neutral.s20",
          color: "neutral.s110",
          borderColor: "neutral.s40",
        },
        icon: {
          color: "neutral.s85",
        },
      },
      brand: {
        root: {
          backgroundColor: "blue.s100",
          color: "fg.onSolid",
          borderColor: "[white]",
          fontWeight: "[530]",
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
    // Whether the image has actually loaded and is visible (drives the neutral
    // fill via data-loaded). Overlays key off this so hover/active feedback
    // matches the visible background, not merely whether a src was provided.
    imageLoaded: {
      true: {},
      false: {},
    },
  },
  compoundVariants: [
    {
      interactive: true,
      tone: "brand",
      imageLoaded: false,
      css: {
        root: {
          "&:hover::after": { backgroundColor: "[rgba(255,255,255,0.16)]" },
          "&:active::after": { backgroundColor: "[rgba(255,255,255,0.3)]" },
        },
      },
    },
    {
      // Placeholder sits on the light neutral fill, so soften the hover tint.
      interactive: true,
      tone: "neutral",
      imageLoaded: false,
      css: {
        root: {
          "&:hover::after": { backgroundColor: "neutral.a45" },
        },
      },
    },
    {
      tone: "neutral",
      size: "xxs",
      css: {
        root: {
          fontWeight: "medium",
        },
      },
    },
    {
      tone: "neutral",
      size: "xs",
      css: {
        root: {
          fontWeight: "medium",
        },
      },
    },
    {
      tone: "neutral",
      size: "sm",
      css: {
        root: {
          fontWeight: "medium",
        },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    tone: "neutral",
    interactive: false,
    imageLoaded: false,
  },
});
