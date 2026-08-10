import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { type AvatarSize, type AvatarTone, Avatar } from "../Avatar/avatar";
import { avatarSize } from "../Avatar/avatar.recipe";
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

  const willOverflow =
    hasOverflow ||
    (hasMax
      ? peopleCount > max
      : numericTotal != null && numericTotal > items.length);

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

  // Each avatar lifts to the front and cross-fades in over its own opaque clone,
  // so it surfaces with no opacity dip while staying the real (interactive)
  // element.
  type LiftPhase = "enter" | "active" | "exit";
  const [phases, setPhases] = useState<Record<number, LiftPhase>>({});
  // Keyboard focus also lifts an avatar to the front (instantly, no animation).
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<"hover" | "focus">("hover");
  // The avatar the pointer currently maps to, so redundant moves within the same
  // column don't re-trigger the lift.
  const pointerIndex = useRef<number | null>(null);
  const active = Object.keys(phases).length > 0;

  const handleEnter = (index: number) => {
    setLastAction("hover");
    setPhases((prev) => {
      const next: Record<number, LiftPhase> = {};
      for (const [key, phase] of Object.entries(prev)) {
        const i = Number(key);
        if (i === index) {
          // Re-entering this avatar; its phase is reset to "enter" below.
          continue;
        }
        // A visible neighbour (active) fades out and one already leaving keeps
        // exiting; an avatar still fading in (enter) is dropped, not exited —
        // see handleLeave for why.
        if (phase !== "enter") {
          next[i] = "exit";
        }
      }
      next[index] = "enter";
      return next;
    });
  };

  const handleLeave = () => {
    setPhases((prev) => {
      const next: Record<number, LiftPhase> = {};
      for (const [key, phase] of Object.entries(prev)) {
        // Only a visible avatar animates out. One still fading in (enter,
        // opacity 0) was never seen, so drop it rather than routing it to
        // "exit": exit leaves opacity at 0 and transform at scale(1) unchanged,
        // so no transition runs, transitionend never fires, and settleExit
        // never clears the phase — stranding an invisible z-index:1000 wrapper
        // that steals clicks from neighbours and pins the clone layer mounted.
        if (phase !== "enter") {
          next[Number(key)] = "exit";
        }
      }
      return next;
    });
  };

  // Advance every freshly-entered avatar enter→active on the next frame, so the
  // opacity-0 start paints before the transition to 1 begins.
  useEffect(() => {
    const entering = Object.entries(phases)
      .filter(([, phase]) => phase === "enter")
      .map(([key]) => Number(key));
    if (entering.length === 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      setPhases((prev) => {
        const next = { ...prev };
        for (const index of entering) {
          if (next[index] === "enter") {
            next[index] = "active";
          }
        }
        return next;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [phases]);

  const settleExit = (index: number) => {
    setPhases((prev) => {
      if (prev[index] !== "exit") {
        return prev;
      }
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleFocus = (index: number, target: EventTarget) => {
    // Ignore mouse-click focus (the hover lift covers that)
    if (target instanceof HTMLElement && target.matches(":focus-visible")) {
      setFocusedIndex(index);
      setLastAction("focus");
    }
  };

  const handleBlur = (index: number) => {
    setFocusedIndex((prev) => (prev === index ? null : prev));
  };

  // Every shown avatar plus the optional overflow badge, in stacking order, so
  // the single hover clone can index into one flat list.
  const entries: { key: string; node: React.ReactNode }[] = shown.map(
    (child, index) => ({ key: child.key ?? String(index), node: child }),
  );

  if (showSurplus) {
    entries.push({
      key: "avatar-group-surplus",
      node: moreElement ?? (
        <Avatar
          shape={shape}
          alt={`${surplusCount} more`}
          placeholder={{
            custom: (
              <span className={classes.surplusText}>{`+${surplusCount}`}</span>
            ),
          }}
        />
      ),
    });
  }

  let hoverIndex: number | null = null;
  for (const [key, phase] of Object.entries(phases)) {
    if (phase === "enter" || phase === "active") {
      hoverIndex = Number(key);
      break;
    }
  }
  let boostIndex: number | null = null;
  if (
    hoverIndex !== null &&
    focusedIndex !== null &&
    hoverIndex !== focusedIndex
  ) {
    boostIndex = lastAction === "focus" ? focusedIndex : hoverIndex;
  }

  // Hover is driven by the pointer's position over the group, split into equal
  // columns — one per avatar — rather than by each avatar's own (overlapping,
  // and once lifted, occluding) box. This gives every avatar an equal, easy hit
  // target even at tight spacing.
  const handlePointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const count = entries.length;
    if (count === 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.max(0, Math.min(count - 1, Math.floor(ratio * count)));
    if (pointerIndex.current !== index) {
      pointerIndex.current = index;
      handleEnter(index);
    }
  };

  const handlePointerLeave = () => {
    pointerIndex.current = null;
    handleLeave();
  };

  return (
    <AvatarGroupContext.Provider value={contextValue}>
      <div
        className={cx(avatarSize({ size }), classes.root, className)}
        onMouseEnter={handlePointer}
        onMouseMove={handlePointer}
        onMouseLeave={handlePointerLeave}
      >
        {entries.map((entry, index) => (
          <span
            key={entry.key}
            className={cx(classes.stackItem, classes.item)}
            data-lift={phases[index]}
            style={
              {
                "--avatar-group-z": String(zIndexAt(index)),
                zIndex: index === boostIndex ? 1002 : undefined,
              } as React.CSSProperties
            }
            onFocus={(event) => handleFocus(index, event.target)}
            onBlur={() => handleBlur(index)}
            onTransitionEnd={(event) => {
              if (event.propertyName === "opacity") {
                settleExit(index);
              }
            }}
          >
            {entry.node}
          </span>
        ))}
        {/* While anything animates, the whole stack is cloned as an opaque
            backdrop so every fading avatar has something solid behind it. The
            layer overlays and mirrors the real row's flex layout, so clones stay
            aligned at any size. `inert` keeps the copies out of the tab order and
            accessibility tree; the real avatars on top stay the interactive ones. */}
        {active ? (
          <span className={classes.cloneLayer} inert>
            {entries.map((entry, index) => (
              <span
                key={`clone:${entry.key}`}
                className={cx(classes.stackItem, classes.cloneItem)}
                data-lift={phases[index]}
                style={
                  {
                    "--avatar-group-z": String(zIndexAt(index)),
                  } as React.CSSProperties
                }
              >
                {entry.node}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </AvatarGroupContext.Provider>
  );
};

export const AvatarGroup = Object.assign(AvatarGroupRoot, { More });
