import { Children, isValidElement, useMemo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { type AvatarSize, type AvatarTone, Avatar } from "../Avatar/avatar";
import { AvatarGroupContext } from "./avatar-group-context";
import { styles } from "./avatar-group.recipe";

export type AvatarGroupProps = {
  className?: string;
  /** Avatar elements to render, in order. `size`/`tone` set on the group
   * cascade to any child that doesn't set its own. */
  children: React.ReactNode;
  /** Cap the number of avatars shown; the remainder collapse into a "+N" badge. */
  max?: number;
  /**
   * Size of the collection the avatars are drawn from, used for the "+N" count
   * (defaults to the number of children). Pass a node to render custom overflow
   * content in place of "+N".
   */
  total?: number | React.ReactNode;
  /** Stack so the last avatar sits on top instead of the first (flips which
   * edge overlaps its neighbour). */
  lastOnTop?: boolean;
  /** How tightly avatars overlap. `md` (default) is the standard overlap; `sm`
   * packs them closer together. */
  spacing?: "sm" | "md";
  size?: AvatarSize;
  tone?: AvatarTone;
};

export const AvatarGroup = ({
  className,
  children,
  max,
  total,
  lastOnTop = false,
  spacing = "md",
  size,
  tone,
}: AvatarGroupProps) => {
  const items = Children.toArray(children).filter(isValidElement);

  const totalIsNode = total != null && typeof total !== "number";
  const numericTotal = typeof total === "number" ? total : null;
  const hasMax = max != null;

  // How many people the group stands for, driving the "+N" surplus figure.
  const peopleCount = numericTotal ?? items.length;

  const willOverflow = hasMax
    ? peopleCount > max || totalIsNode
    : numericTotal != null
      ? numericTotal > items.length
      : totalIsNode;

  // When capping, reserve a slot for the badge so the group never exceeds `max`.
  const shownCount = Math.max(
    0,
    Math.min(willOverflow && hasMax ? max - 1 : items.length, items.length),
  );

  const shown = items.slice(0, shownCount);
  const surplusCount = peopleCount - shownCount;
  const showSurplus = totalIsNode || surplusCount > 0;

  // The badge is a circle if any item is a circle; only a fully-square group
  // gets a square badge. An item whose shape can't be read (e.g. a Tooltip-
  // wrapped avatar) counts as non-square, so the badge stays a circle.
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
            <Avatar
              shape={shape}
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
    </AvatarGroupContext.Provider>
  );
};
