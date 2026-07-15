import { css, cx } from "@hashintel/ds-helpers/css";

import { Icon, type IconName } from "../Icon/icon";
import { styles } from "./chip.recipe";

import type { FormInputSize } from "../../util/form-shared";
import type { ExclusifyUnion } from "type-fest";

/**
 * A prefix/suffix slot. Its content is an icon, a status dot, or arbitrary
 * children. `variant` shapes the slot's edge treatment (see the affix zone
 * styles below); `onClick` makes just the slot interactive.
 */
type PrefixOrSuffix = (
  | { iconName: IconName }
  | { dot: "filled" | "partiallyFilled" | "empty" }
  | { children: React.ReactNode }
) & { onClick?: () => void; variant?: "straight" | "circle" | "angle" };

export type ChipColor =
  | "grey"
  | "red"
  | "blue"
  | "green"
  | "orange"
  | "yellow"
  | "purple"
  | "pink"
  | "black";

export type ChipProps = {
  className?: string;
  children: React.ReactNode;
  size?: FormInputSize;
  shape?: "default" | "round";
  color?: ChipColor;
  variant?: "fill" | "fillLight" | "outline" | "subtle";
  onClick?: () => void;
  prefix?: PrefixOrSuffix;
} & ExclusifyUnion<
  | {
      removeable?: {
        removeable: boolean;
        onRemove: () => void;
      };
    }
  | { suffix?: PrefixOrSuffix }
>;

// Icons and dots sit one step down from the chip's own size so they read as an
// accent rather than dominating the label.
const iconSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xs",
  xs: "xs",
  sm: "xs",
  md: "sm",
  lg: "sm",
};

const dotSizeMap: Record<FormInputSize, string> = {
  xxs: "6px",
  xs: "6px",
  sm: "7px",
  md: "8px",
  lg: "9px",
};

// ── Affix zone styles ────────────────────────────────────────────────────
// A tint keyed to `currentColor` gives the prefix/suffix zone a subtle,
// colour-agnostic contrast against the chip body across every variant.
const zoneTint = "[color-mix(in srgb, currentColor 12%, transparent)]";

const inlineAffix = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
});

// Full-height zones bleed past the chip's padding + border to sit flush with
// the (clipped) pill edge.
const zoneBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  alignSelf: "stretch",
  paddingInline: "var(--chip-px)",
  marginBlock: "[calc(-1 * var(--form-padding-y) - var(--form-border-width))]",
  backgroundColor: zoneTint,
} as const;

const prefixStraight = css({
  ...zoneBase,
  marginInlineStart: "[calc(-1 * var(--chip-px) - var(--form-border-width))]",
});

const suffixStraight = css({
  ...zoneBase,
  marginInlineEnd: "[calc(-1 * var(--chip-px) - var(--form-border-width))]",
});

const prefixAngle = css({
  ...zoneBase,
  marginInlineStart: "[calc(-1 * var(--chip-px) - var(--form-border-width))]",
  paddingInlineEnd: "[calc(var(--chip-px) + 0.5em)]",
  clipPath: "[polygon(0 0, 100% 0, calc(100% - 0.5em) 100%, 0 100%)]",
});

const suffixAngle = css({
  ...zoneBase,
  marginInlineEnd: "[calc(-1 * var(--chip-px) - var(--form-border-width))]",
  paddingInlineStart: "[calc(var(--chip-px) + 0.5em)]",
  clipPath: "[polygon(0.5em 0, 100% 0, 100% 100%, 0 100%)]",
});

// A circular badge, sized to the chip's content height (does not bleed).
const circleAffix = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  alignSelf: "stretch",
  aspectRatio: "1",
  borderRadius: "full",
  backgroundColor: zoneTint,
});

// Layered on top of any zone/inline class when the affix itself is clickable.
const interactiveAffix = css({
  cursor: "pointer",
  appearance: "none",
  font: "inherit",
  color: "[inherit]",
  border: "none",
  _hover: {
    backgroundColor: "[color-mix(in srgb, currentColor 20%, transparent)]",
  },
  "&:focus-visible": {
    outline: "2px solid",
    outlineColor: "black.a60",
    outlineOffset: "[-2px]",
  },
});

const removeButton = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  cursor: "pointer",
  appearance: "none",
  border: "none",
  background: "[transparent]",
  color: "[inherit]",
  padding: "0",
  borderRadius: "full",
  opacity: "0.7",
  transition: "[opacity 0.15s ease, background 0.15s ease]",
  _hover: {
    opacity: "1",
    backgroundColor: "[color-mix(in srgb, currentColor 18%, transparent)]",
  },
  "&:focus-visible": {
    outline: "2px solid",
    outlineColor: "black.a60",
    outlineOffset: "[-1px]",
    opacity: "1",
  },
});

const dotBase = css({
  display: "inline-block",
  flexShrink: "0",
  borderRadius: "full",
  boxSizing: "border-box",
  borderWidth: "1.5px",
  borderStyle: "solid",
  borderColor: "[currentColor]",
});

const ChipDot = ({
  state,
  size,
}: {
  state: "filled" | "partiallyFilled" | "empty";
  size: FormInputSize;
}) => {
  const dimension = dotSizeMap[size];
  const background =
    state === "filled"
      ? "currentColor"
      : state === "partiallyFilled"
        ? "linear-gradient(to right, currentColor 0 50%, transparent 50% 100%)"
        : "transparent";

  return (
    <span
      aria-hidden="true"
      className={dotBase}
      style={{ width: dimension, height: dimension, background }}
    />
  );
};

const zoneClassName = (
  side: "prefix" | "suffix",
  variant: PrefixOrSuffix["variant"],
): string => {
  switch (variant) {
    case "straight":
      return side === "prefix" ? prefixStraight : suffixStraight;
    case "angle":
      return side === "prefix" ? prefixAngle : suffixAngle;
    case "circle":
      return circleAffix;
    default:
      return inlineAffix;
  }
};

const ChipAffix = ({
  affix,
  side,
  size,
}: {
  affix: PrefixOrSuffix;
  side: "prefix" | "suffix";
  size: FormInputSize;
}) => {
  const content =
    "iconName" in affix ? (
      <Icon name={affix.iconName} size={iconSizeMap[size]} />
    ) : "dot" in affix ? (
      <ChipDot state={affix.dot} size={size} />
    ) : (
      affix.children
    );

  const className = cx(
    zoneClassName(side, affix.variant ?? "straight"),
    affix.onClick && interactiveAffix,
  );

  if (affix.onClick) {
    return (
      <button type="button" className={className} onClick={affix.onClick}>
        {content}
      </button>
    );
  }

  return <span className={className}>{content}</span>;
};

export const Chip = ({
  className,
  children,
  size = "md",
  shape = "default",
  color = "grey",
  variant = "fill",
  onClick,
  prefix,
  suffix,
  removeable,
}: ChipProps) => {
  const showRemove = !!removeable?.removeable;

  // A chip can be clickable as a whole and/or expose interactive affixes. To
  // avoid nesting <button>s, the root is only a native button when nothing
  // inside it is independently interactive.
  const hasInteractiveAffix =
    !!prefix?.onClick || !!suffix?.onClick || showRemove;
  const clickable = !!onClick;

  const classes = styles({ size, color, variant, shape, clickable });

  const content = (
    <>
      {prefix ? <ChipAffix affix={prefix} side="prefix" size={size} /> : null}
      <span className={classes.label}>{children}</span>
      {suffix ? <ChipAffix affix={suffix} side="suffix" size={size} /> : null}
      {showRemove ? (
        <button
          type="button"
          aria-label="Remove"
          className={removeButton}
          onClick={removeable.onRemove}
        >
          <Icon name="close" size={iconSizeMap[size]} />
        </button>
      ) : null}
    </>
  );

  const rootClassName = cx(classes.root, className);

  if (clickable && !hasInteractiveAffix) {
    return (
      <button type="button" className={rootClassName} onClick={onClick}>
        {content}
      </button>
    );
  }

  if (clickable) {
    return (
      <div
        className={rootClassName}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
      >
        {content}
      </div>
    );
  }

  return <div className={rootClassName}>{content}</div>;
};
