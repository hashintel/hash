import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: [
    "root",
    "stackItem",
    "item",
    "cloneLayer",
    "cloneItem",
    "surplusText",
  ],
  base: {
    root: {
      display: "inline-flex",
      alignItems: "center",
      width: "[fit-content]",
      position: "relative",
      isolation: "isolate",
    },
    // Shared by both stacking layers — the interactive avatar row and its clone
    stackItem: {
      display: "inline-flex",
      zIndex: "[var(--avatar-group-z)]",
      transformOrigin: "center",
      "&:not(:first-child)": {
        // `--avatar-size` is declared on the group root (via the shared
        // `avatarSize` recipe) so these wrappers, sitting above the avatars,
        // can read it. Falls back to md for a custom group that omits it.
        marginInlineStart:
          "[calc(var(--avatar-size, 32px) * var(--avatar-overlap) * -1)]",
      },
      // Lift scale tracks the avatar size (see the `size` variant): smaller
      // avatars pop a little more, larger a little less. The fallback covers
      // custom sizes, and lets a consumer tune it via `--avatar-lift-scale`.
      "&[data-lift='active']": {
        transform: "[scale(var(--avatar-lift-scale, 1.18))]",
      },
    },
    // The interactive layer. Cross-fades over its opaque clone and re-stacks as
    // it lifts; shared layout/lift geometry comes from `stackItem`.
    item: {
      "&:has(:focus-visible)": {
        zIndex: "[1001]",
      },
      "&[data-lift='enter']": {
        zIndex: "[1001]",
        opacity: "[0]",
        transform: "[scale(1)]",
        transition: "[none]",
      },
      "&[data-lift='active']": {
        zIndex: "[1001]",
        opacity: "[1]",
        transition: "[opacity 120ms ease, transform 120ms ease]",
      },
      "&[data-lift='exit']": {
        zIndex: "[1000]",
        opacity: "[0]",
        transform: "[scale(1)]",
        transition: "[opacity 120ms ease, transform 120ms ease]",
      },
    },
    // An opaque backdrop stack, cloned while anything animates, so a fading real
    // avatar always has something solid behind it (no flash). It overlays the
    // real row and mirrors its layout exactly
    cloneLayer: {
      position: "absolute",
      top: "0",
      left: "0",
      display: "inline-flex",
      alignItems: "center",
      // Below the lifted reals (1000/1001), above the resting stack it mirrors.
      zIndex: "[999]",
      pointerEvents: "none",
    },
    cloneItem: {
      transition: "[transform 120ms ease]",
    },
    surplusText: {
      fontSize: "[36cqw]",
      fontWeight: "medium",
      whiteSpace: "nowrap",
    },
  },
  variants: {
    // The overlap/parting distance is driven by `--avatar-size`, declared on the
    // group root by the shared `avatarSize` recipe (see avatar-group.tsx) so it's
    // a single source of truth with the avatars themselves. This variant only
    // tunes the hover lift: `--avatar-lift-scale` eases down as avatars grow (a
    // fixed 1.25 pops too hard on large avatars and too softly on small ones),
    // keeping the felt "pop" roughly even. Custom sizes fall back to the value in
    // the lift transform (tunable via `--avatar-lift-scale`).
    size: {
      xxs: { root: { "--avatar-lift-scale": "1.35" } },
      xs: { root: { "--avatar-lift-scale": "1.32" } },
      sm: { root: { "--avatar-lift-scale": "1.29" } },
      md: { root: { "--avatar-lift-scale": "1.25" } },
      lg: { root: { "--avatar-lift-scale": "1.2" } },
      custom: {},
    },
    // How tightly avatars overlap, as a fraction of the avatar width.
    spacing: {
      sm: { root: { "--avatar-overlap": "0.65" } },
      md: { root: { "--avatar-overlap": "0.3" } },
    },
    // A white ring separates overlapping avatars, applied to the wrapped avatar
    // itself so children need no styling of their own. The avatar is matched by
    // its `data-loaded` attribute at any depth. Drawn as an outset box-shadow
    // — outside the avatar's border, follows its radius (circle/square),
    // adds no layout width — so the overlap maths and tone border are intact.
    // Uses the Avatar recipe's border-width formula, so it tracks the border.
    // Brand avatars have a white border while showing their placeholder,
    // so their ring waits until an image has loaded.
    tone: {
      neutral: {
        stackItem: {
          "& :where([data-loaded]:not(img))": {
            boxShadow:
              "[0 0 0 max(1px, min(calc(var(--avatar-size) / 32), 3px)) white]",
          },
        },
      },
      brand: {
        stackItem: {
          "& :where([data-loaded='true']:not(img))": {
            boxShadow:
              "[0 0 0 max(1px, min(calc(var(--avatar-size) / 32), 3px)) white]",
          },
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
    spacing: "md",
    tone: "neutral",
  },
});
