import { sva } from "@hashintel/ds-helpers/css";

// All AvatarGroup styling. `--avatar-group-size` mirrors avatar.recipe.ts so the
// overlap maths track the avatar box; `--avatar-overlap` is the fraction each
// avatar overlaps its neighbour. The per-item stacking `--avatar-group-z` is the
// only style left inline, since it is computed per avatar.
export const styles = sva({
  slots: ["root", "item", "surplusText"],
  base: {
    root: {
      display: "inline-flex",
      alignItems: "center",
      // Own the stacking context so the overlap z-indexes stay contained.
      isolation: "isolate",
      // Reveal the hovered avatar by parting its neighbours rather than
      // restacking it: earlier siblings slide back, later siblings slide
      // forward. Because the reveal comes from the neighbours moving (not a
      // z-index change), the hovered avatar surfaces smoothly — no pop, no
      // sideways drift of itself, no fade.
      //
      // The shift exactly cancels the overlap so neighbours come to rest flush
      // against the hovered avatar. Overshooting would open a gap between the
      // square hit-boxes, and dragging the cursor across that gap drops the
      // hover — which collapses the whole group and re-parts it, reading as
      // jitter. Flush boxes (kept slightly overlapped by the hovered avatar's
      // scale) leave no gap, so moving between avatars only re-animates the two
      // that swap roles.
      //
      // Hovering the first avatar is a no-op: it is already on top and fully in
      // view, so there is nothing to reveal. The `:not(:first-child)` guards
      // skip its scale and forward shift (the back shift already no-ops — the
      // first avatar has no preceding siblings to move).
      "& > *:has(~ *:hover)": {
        transform:
          "[translateX(calc(var(--avatar-group-size) * var(--avatar-overlap) * -1))]",
        _motionReduce: { transform: "[none]" },
      },
      "& > *:not(:first-child):hover ~ *": {
        transform:
          "[translateX(calc(var(--avatar-group-size) * var(--avatar-overlap)))]",
        _motionReduce: { transform: "[none]" },
      },
      // A gentle lift anchors focus on the hovered avatar; it stays in place.
      "& > *:not(:first-child):hover": {
        transform: "[scale(1.05)]",
        _motionReduce: { transform: "[none]" },
      },
    },
    item: {
      display: "inline-flex",
      zIndex: "[var(--avatar-group-z)]",
      transition: "[transform 200ms ease]",
      "&:not(:first-child)": {
        // Overlap the preceding avatar by the `spacing`-driven fraction.
        marginInlineStart:
          "[calc(var(--avatar-group-size) * var(--avatar-overlap) * -1)]",
      },
    },
    surplusText: {
      fontSize: "[36cqw]",
      fontWeight: "medium",
      whiteSpace: "nowrap",
    },
  },
  variants: {
    // Mirrors avatar.recipe.ts sizes; drives the overlap/parting distance.
    size: {
      xxs: { root: { "--avatar-group-size": "16px" } },
      xs: { root: { "--avatar-group-size": "20px" } },
      sm: { root: { "--avatar-group-size": "24px" } },
      md: { root: { "--avatar-group-size": "32px" } },
      lg: { root: { "--avatar-group-size": "48px" } },
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
      },
      brand: {
        item: {
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
