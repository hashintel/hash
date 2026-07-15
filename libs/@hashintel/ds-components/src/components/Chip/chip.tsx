import { cx } from "@hashintel/ds-helpers/css";

import { Icon, type IconName } from "../Icon/icon";
import { affixStyles, dotStyles, styles } from "./chip.recipe";

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
) & {
  onClick?: () => void;
  variant?: "straight" | "circle" | "angle" | "naked";
};

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

const ChipDot = ({
  state,
  size,
}: {
  state: "filled" | "partiallyFilled" | "empty";
  size: FormInputSize;
}) => <span aria-hidden="true" className={dotStyles({ size, state })} />;

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

  const className = affixStyles({
    treatment: affix.variant ?? "straight",
    side,
    interactive: !!affix.onClick,
  });

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
          className={classes.removeButton}
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
