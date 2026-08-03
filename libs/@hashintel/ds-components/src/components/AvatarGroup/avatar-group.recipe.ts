import { sva } from "@hashintel/ds-helpers/css";

// All AvatarGroup styling. `--avatar-group-size` mirrors avatar.recipe.ts so the
// overlap maths track the avatar box; `--avatar-overlap` is the fraction each
// avatar overlaps its neighbour. The per-item stacking `--avatar-group-z` is the
// only style left inline, since it is computed per avatar.
export const styles = sva({
  slots: ["root", "item", "cloneLayer", "cloneItem", "surplusText"],
  base: {
    root: {
      display: "inline-flex",
      alignItems: "center",
      // Stay shrink-to-fit even inside a stretching grid/flex parent, so the
      // group's box tracks the avatar row — the pointer-position hover maths
      // divide this width into one column per avatar.
      width: "[fit-content]",
      // Anchor the absolutely-positioned hover clone to the group.
      position: "relative",
      // Own the stacking context so the overlap z-indexes stay contained.
      isolation: "isolate",
    },
    item: {
      display: "inline-flex",
      zIndex: "[var(--avatar-group-z)]",
      transformOrigin: "center",
      "&:not(:first-child)": {
        // Overlap the preceding avatar by the `spacing`-driven fraction.
        marginInlineStart:
          "[calc(var(--avatar-group-size) * var(--avatar-overlap) * -1)]",
      },
      // Keyboard focus jumps the avatar to the front (no animation) so its focus
      // ring is never clipped by a neighbour. Scoped to `:focus-visible` so a
      // mouse click — already handled by the hover lift — doesn't restack.
      "&:has(:focus-visible)": {
        zIndex: "[1001]",
      },
      // Lift phases (driven from the component). The avatar stays the real,
      // interactive element throughout — it just rises above the stack (and the
      // backdrop clones) and cross-fades in. `enter` snaps it to opacity 0 with
      // no transition so the fade to 1 in `active` has a clean start; `exit`
      // fades it back out before it settles to rest. An incoming avatar (`active`)
      // sits above an outgoing one (`exit`) so a sweep reads cleanly.
      "&[data-lift='enter']": {
        zIndex: "[1001]",
        opacity: "[0]",
        transform: "[scale(1)]",
        transition: "[none]",
      },
      "&[data-lift='active']": {
        zIndex: "[1001]",
        opacity: "[1]",
        // Lift scale tracks the avatar size (see the `size` variant): smaller
        // avatars pop a little more, larger a little less. The fallback covers
        // custom sizes, and lets a consumer tune it via `--avatar-lift-scale`.
        transform: "[scale(var(--avatar-lift-scale, 1.18))]",
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
    // real row and mirrors its flex layout exactly — same widths, same overlap —
    // so clones stay aligned with their real avatar regardless of the host's
    // box-sizing (an absolute `left` formula drifted under content-box, worst at
    // small sizes). `inert` + `pointerEvents: none` keep it a pure backdrop; the
    // real avatars on top handle all interaction.
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
      display: "inline-flex",
      zIndex: "[var(--avatar-group-z)]",
      transform: "[scale(1)]",
      transformOrigin: "center",
      transition: "[transform 120ms ease]",
      "&:not(:first-child)": {
        // Same overlap as the real row so the layouts coincide exactly.
        marginInlineStart:
          "[calc(var(--avatar-group-size) * var(--avatar-overlap) * -1)]",
      },
      // Scales up in lockstep with its real avatar (see `item`).
      "&[data-lift='active']": {
        transform: "[scale(var(--avatar-lift-scale, 1.18))]",
      },
    },
    surplusText: {
      fontSize: "[36cqw]",
      fontWeight: "medium",
      whiteSpace: "nowrap",
    },
  },
  variants: {
    // Mirrors avatar.recipe.ts sizes; drives the overlap/parting distance and the
    // hover lift scale. `--avatar-lift-scale` eases down as avatars grow (a fixed
    // 1.25 pops too hard on large avatars and too softly on small ones), keeping
    // the felt "pop" roughly even. Custom sizes fall back to the value in the
    // lift transform (tunable via `--avatar-lift-scale`).
    size: {
      xxs: {
        root: { "--avatar-group-size": "16px", "--avatar-lift-scale": "1.35" },
      },
      xs: {
        root: { "--avatar-group-size": "20px", "--avatar-lift-scale": "1.32" },
      },
      sm: {
        root: { "--avatar-group-size": "24px", "--avatar-lift-scale": "1.29" },
      },
      md: {
        root: { "--avatar-group-size": "32px", "--avatar-lift-scale": "1.25" },
      },
      lg: {
        root: { "--avatar-group-size": "48px", "--avatar-lift-scale": "1.2" },
      },
      // Defer to the --avatar-size the consumer sets on the group.
      custom: { root: { "--avatar-group-size": "[var(--avatar-size, 32px)]" } },
    },
    // How tightly avatars overlap, as a fraction of the avatar width.
    spacing: {
      sm: { root: { "--avatar-overlap": "0.65" } },
      md: { root: { "--avatar-overlap": "0.3" } },
    },
    // A white ring separates overlapping avatars, applied to the wrapped avatar
    // itself so children need no styling of their own. The avatar is matched by
    // its `data-loaded` attribute at any depth (`:not(img)` skips the inner
    // image), so it still lands on the avatar even when a child wraps it (e.g. a
    // Tooltip). `:where` keeps specificity at one class so the avatar's own
    // focus ring still wins. Drawn as an outset box-shadow — outside the avatar's
    // border, follows its radius (circle/square), adds no layout width — so the
    // overlap maths and tone border are intact. Ring width uses the Avatar
    // recipe's border-width formula, so it tracks the border. Brand avatars have
    // a white border while showing their placeholder, so their ring waits until
    // an image has loaded.
    tone: {
      neutral: {
        item: {
          "& :where([data-loaded]:not(img))": {
            boxShadow:
              "[0 0 0 max(1px, min(calc(var(--avatar-size) / 32), 3px)) white]",
          },
        },
        cloneItem: {
          "& :where([data-loaded]:not(img))": {
            boxShadow:
              "[0 0 0 max(1px, min(calc(var(--avatar-size) / 32), 3px)) white]",
          },
        },
      },
      brand: {
        item: {
          "& :where([data-loaded='true']:not(img))": {
            boxShadow:
              "[0 0 0 max(1px, min(calc(var(--avatar-size) / 32), 3px)) white]",
          },
        },
        cloneItem: {
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
