import { Children, isValidElement, useMemo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { type AvatarSize, type AvatarTone, Avatar } from "../Avatar/avatar";
import { AvatarGroupContext } from "./avatar-group-context";
import { styles } from "./avatar-group.recipe";

type AvatarProps = React.ComponentProps<typeof Avatar>;

export type AvatarGroupMoreProps = Omit<
  AvatarProps,
  "src" | "placeholder" | "shape"
> & {
  /** Content shown inside the overflow badge (e.g. "+99"). */
  children: React.ReactNode;
  /** Badge shape; defaults to a circle. */
  shape?: "circle" | "square";
};

/**
 * Custom overflow badge for an {@link AvatarGroup}. Place it among the group's
 * children to replace the automatic "+N" badge; its `children` become the badge
 * content. Accepts the same styling props as an Avatar (except `src` and
 * `placeholder`), and inherits the group's `size`/`tone` when unset.
 */
const More = ({
  children,
  shape = "circle",
  ...rest
}: AvatarGroupMoreProps) => (
  // `rest` is an Omit of AvatarProps, which flattens Avatar's onClick|href
  // exclusive union; cast back so it spreads onto Avatar.
  <Avatar
    {...(rest as AvatarProps)}
    shape={shape}
    placeholder={{ custom: children }}
  />
);
More.displayName = "AvatarGroup.More";

export type AvatarGroupProps = {
  className?: string;
  /** Avatar elements to render, in order. `size`/`tone` set on the group
   * cascade to any child that doesn't set its own. Include an
   * `<AvatarGroup.More>` to customise the overflow badge. */
  children: React.ReactNode;
  /** Cap the number of avatars shown; the remainder collapse into a "+N" badge. */
  max?: number;
  /** Size of the collection the avatars are drawn from, used for the "+N" count
   * (defaults to the number of avatar children). */
  total?: number;
  /** Stack so the last avatar sits on top instead of the first (flips which
   * edge overlaps its neighbour). */
  lastOnTop?: boolean;
  /** How tightly avatars overlap. `md` (default) is the standard overlap; `sm`
   * packs them closer together. */
  spacing?: "sm" | "md";
  size?: AvatarSize;
  tone?: AvatarTone;
};

const AvatarGroupRoot = ({
  className,
  children,
  max,
  total,
  lastOnTop = false,
  spacing = "md",
  size,
  tone,
}: AvatarGroupProps) => {
  const childArray = Children.toArray(children).filter(isValidElement);
  // A custom overflow badge, if provided, is pulled out of the avatar list.
  const moreElement = childArray.find((child) => child.type === More);
  const items = childArray.filter((child) => child.type !== More);

  const hasOverflow = moreElement != null;
  const numericTotal = total ?? null;
  const hasMax = max != null;

  // How many people the group stands for, driving the "+N" surplus figure.
  const peopleCount = numericTotal ?? items.length;

  const willOverflow = hasMax
    ? peopleCount > max || hasOverflow
    : numericTotal != null
      ? numericTotal > items.length
      : hasOverflow;

  // When capping, reserve a slot for the badge so the group never exceeds `max`.
  const shownCount = Math.max(
    0,
    Math.min(willOverflow && hasMax ? max - 1 : items.length, items.length),
  );

  const shown = items.slice(0, shownCount);
  const surplusCount = peopleCount - shownCount;
  const showSurplus = hasOverflow || surplusCount > 0;

  // The auto badge is a circle if any item is a circle; only a fully-square
  // group gets a square badge. An item whose shape can't be read (e.g. a
  // Tooltip-wrapped avatar) counts as non-square, so the badge stays a circle.
  const allSquare =
    items.length > 0 &&
    items.every(
      (item) =>
        (item.props as { shape?: "circle" | "square" }).shape === "square",
    );
  const shape = allSquare ? "square" : "circle";

  // Stacking order: by default the first (leftmost) item sits highest so each
  // avatar overlaps the next; `lastOnTop` flips it so the last item sits highest.
  const itemCount = shownCount + (showSurplus ? 1 : 0);
  const zIndexAt = (position: number) =>
    lastOnTop ? position + 1 : itemCount - position;

  const classes = styles({ size, spacing, tone });

  const contextValue = useMemo(() => ({ size, tone }), [size, tone]);

  return (
    <AvatarGroupContext.Provider value={contextValue}>
      <div className={cx(classes.root, className)}>
        {shown.map((child, index) => (
          <span
            key={child.key}
            className={classes.item}
            style={
              {
                "--avatar-group-z": String(zIndexAt(index)),
              } as React.CSSProperties
            }
          >
            {child}
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
            {moreElement ?? (
              <Avatar
                shape={shape}
                alt={`${surplusCount} more`}
                placeholder={{
                  custom: (
                    <span
                      className={classes.surplusText}
                    >{`+${surplusCount}`}</span>
                  ),
                }}
              />
            )}
          </span>
        ) : null}
      </div>
    </AvatarGroupContext.Provider>
  );
};

export const AvatarGroup = Object.assign(AvatarGroupRoot, { More });
