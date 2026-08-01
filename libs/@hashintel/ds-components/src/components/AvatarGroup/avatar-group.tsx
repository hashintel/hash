import { cx } from "@hashintel/ds-helpers/css";

import { type AvatarSize, type AvatarTone, Avatar } from "../Avatar/avatar";
import { styles } from "./avatar-group.recipe";

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
  lastOnTop?: boolean;
  /** How tightly avatars overlap. `md` (default) is the standard overlap; `sm`
   * packs them closer together. */
  spacing?: "sm" | "md";
};

export const AvatarGroup = ({
  className,
  avatars,
  max,
  total,
  size = "md",
  tone,
  lastOnTop = false,
  spacing = "md",
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
  // avatar overlaps the next; `lastOnTop` flips it so the last item sits highest.
  const itemCount = shownCount + (showSurplus ? 1 : 0);
  const zIndexAt = (position: number) =>
    lastOnTop ? position + 1 : itemCount - position;

  const classes = styles({ size, spacing, tone });

  return (
    <div className={cx(classes.root, className)}>
      {shown.map((avatar, index) => (
        <span
          key={avatar.src ?? avatar.alt}
          className={classes.item}
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
            className={cx(classes.ring, avatar.className)}
          />
        </span>
      ))}
      {showSurplus ? (
        <span
          className={classes.item}
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
            className={classes.ring}
            alt={totalIsNode ? "more" : `${surplusCount} more`}
            placeholder={{
              custom: totalIsNode ? (
                total
              ) : (
                <span
                  className={classes.surplusText}
                >{`+${surplusCount}`}</span>
              ),
            }}
          />
        </span>
      ) : null}
    </div>
  );
};
