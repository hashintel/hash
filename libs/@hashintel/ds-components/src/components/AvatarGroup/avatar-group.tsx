import { css, cx } from "@hashintel/ds-helpers/css";

import { type AvatarSize, type AvatarTone, Avatar } from "../Avatar/avatar";

export type AvatarGroupProps = {
  className?: string;
  /** Avatars to render, in order. Size and tone are controlled by the group. */
  avatars: Array<Omit<React.ComponentProps<typeof Avatar>, "size" | "tone">>;
  /** Cap the number of circles shown; the remainder collapse into a "+N" badge. */
  max?: number;
  /**
   * Size of the collection the avatars are drawn from, used for the "+N" count
   * (defaults to `avatars.length`). Pass a node to render custom overflow
   * content in place of "+N".
   */
  total?: number | React.ReactNode;
  size?: AvatarSize;
  tone?: AvatarTone;
  /** Stack so the last avatar sits on top instead of the first (flips which
   * edge overlaps its neighbour). */
  reverse?: boolean;
};

// Pixel width per avatar size, mirroring avatar.recipe.ts, used to size the
// overlap. `custom` defers to the --avatar-size the consumer sets on the group.
const avatarSizeVar: Record<AvatarSize, string> = {
  xxs: "16px",
  xs: "20px",
  sm: "24px",
  md: "32px",
  lg: "48px",
  custom: "var(--avatar-size, 32px)",
};

const containerStyles = css({
  display: "inline-flex",
  alignItems: "center",
  // Own the stacking context so the overlap z-indexes stay contained.
  isolation: "isolate",
  // Reveal the hovered avatar by parting its neighbours rather than restacking
  // it: earlier siblings slide back, later siblings slide forward. Because the
  // reveal comes from the neighbours moving (not a z-index change), the hovered
  // avatar surfaces smoothly — no pop, no sideways drift of itself, no fade.
  //
  // The shift exactly cancels the 0.3 overlap so neighbours come to rest flush
  // against the hovered avatar. Overshooting would open a gap between the square
  // hit-boxes, and dragging the cursor across that gap drops the hover — which
  // collapses the whole group and re-parts it, reading as jitter. Flush boxes
  // (kept slightly overlapped by the hovered avatar's scale) leave no gap, so
  // moving between avatars only re-animates the two that swap roles.
  //
  // Hovering the first avatar is a no-op: it is already on top and fully in
  // view, so there is nothing to reveal. The `:not(:first-child)` guards skip
  // its scale and forward shift (the back shift already no-ops — the first
  // avatar has no preceding siblings to move).
  "& > *:has(~ *:hover)": {
    transform: "[translateX(calc(var(--avatar-group-size) * -0.3))]",
    _motionReduce: { transform: "[none]" },
  },
  "& > *:not(:first-child):hover ~ *": {
    transform: "[translateX(calc(var(--avatar-group-size) * 0.3))]",
    _motionReduce: { transform: "[none]" },
  },
  // A gentle lift anchors focus on the hovered avatar; it stays in place.
  "& > *:not(:first-child):hover": {
    transform: "[scale(1.05)]",
    _motionReduce: { transform: "[none]" },
  },
});

const itemStyles = css({
  display: "inline-flex",
  zIndex: "[var(--avatar-group-z)]",
  transition: "[transform 200ms ease]",
  "&:not(:first-child)": {
    // Overlap the preceding avatar by ~30% of its width.
    marginInlineStart: "[calc(var(--avatar-group-size) * -0.3)]",
  },
});

const surplusTextStyles = css({
  fontSize: "[36cqw]",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

// A white ring around each avatar separates overlapping avatars. Drawn as an
// outset box-shadow — it sits outside the avatar's own border, follows its
// radius (circle/square), and adds no layout width, so the overlap maths and
// the avatar's tone border are both left intact. Ring width uses the same
// formula as the Avatar recipe's border-width, so the ring tracks the border.
const whiteRingStyles = css({
  boxShadow: "[0 0 0 max(1px, min(calc(var(--avatar-size) / 32), 3px)) white]",
});

// A brand-tone avatar already has a white border while it shows its placeholder
// (no image, or the image hasn't loaded), so the ring would be redundant there.
// Gate it on data-loaded so it only appears once an image has loaded and the
// border switches to the neutral fill.
const whiteRingWhenLoadedStyles = css({
  "&[data-loaded='true']": {
    boxShadow:
      "[0 0 0 max(1px, min(calc(var(--avatar-size) / 32), 3px)) white]",
  },
});

export const AvatarGroup = ({
  className,
  avatars,
  max,
  total,
  size = "md",
  tone,
  reverse = false,
}: AvatarGroupProps) => {
  const totalIsNode = total != null && typeof total !== "number";
  const numericTotal = typeof total === "number" ? total : null;
  const hasMax = max != null;

  // How many people the group stands for, driving the "+N" surplus figure.
  const peopleCount = numericTotal ?? avatars.length;

  const willOverflow = hasMax
    ? peopleCount > max || totalIsNode
    : numericTotal != null
      ? numericTotal > avatars.length
      : totalIsNode;

  // When capping, reserve a slot for the badge so the group never exceeds `max`.
  const shownCount = Math.max(
    0,
    Math.min(willOverflow && hasMax ? max - 1 : avatars.length, avatars.length),
  );

  const shown = avatars.slice(0, shownCount);
  const surplusCount = peopleCount - shownCount;
  const showSurplus = totalIsNode || surplusCount > 0;

  const shape = avatars[0]?.shape ?? "circle";

  // Stacking order: by default the first (leftmost) item sits highest so each
  // avatar overlaps the next; `reverse` flips it so the last item sits highest.
  const itemCount = shownCount + (showSurplus ? 1 : 0);
  const zIndexAt = (position: number) =>
    reverse ? position + 1 : itemCount - position;

  // Brand avatars only get the ring once an image loads (see above).
  const ringStyles =
    tone === "brand" ? whiteRingWhenLoadedStyles : whiteRingStyles;

  return (
    <div
      className={cx(containerStyles, className)}
      style={
        { "--avatar-group-size": avatarSizeVar[size] } as React.CSSProperties
      }
    >
      {shown.map((avatar, index) => (
        <span
          key={avatar.src ?? avatar.alt}
          className={itemStyles}
          style={
            {
              "--avatar-group-z": String(zIndexAt(index)),
            } as React.CSSProperties
          }
        >
          <Avatar
            {...(avatar as React.ComponentProps<typeof Avatar>)}
            size={size}
            tone={tone}
            className={cx(ringStyles, avatar.className)}
          />
        </span>
      ))}
      {showSurplus ? (
        <span
          className={itemStyles}
          style={
            {
              "--avatar-group-z": String(zIndexAt(shownCount)),
            } as React.CSSProperties
          }
        >
          <Avatar
            shape={shape}
            size={size}
            tone={tone}
            className={ringStyles}
            alt={totalIsNode ? "more" : `${surplusCount} more`}
            placeholder={{
              custom: totalIsNode ? (
                total
              ) : (
                <span className={surplusTextStyles}>{`+${surplusCount}`}</span>
              ),
            }}
          />
        </span>
      ) : null}
    </div>
  );
};
