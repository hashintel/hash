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

const iconSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xxs",
  xs: "xs",
  sm: "xs",
  md: "xs",
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
  const prefixInteractive = !!prefix?.onClick;
  const suffixInteractive = !!suffix?.onClick;

  const hasInteractiveAffix =
    prefixInteractive || suffixInteractive || showRemove;
  const clickable = !!onClick;
  const rootIsButton = clickable && !hasInteractiveAffix;
  const segmentedButton = clickable && hasInteractiveAffix;

  const classes = styles({
    size,
    color,
    variant,
    shape,
    clickable: rootIsButton,
    hasPrefix: !!prefix,
    hasSuffix: !!suffix || showRemove,
    segmented: segmentedButton,
  });

  const rootClassName = cx(classes.root, className);

  const prefixNode = prefix && (
    <ChipAffix affix={prefix} side="prefix" size={size} />
  );
  const suffixNode = suffix && (
    <ChipAffix affix={suffix} side="suffix" size={size} />
  );
  const removeNode = showRemove && (
    <button
      type="button"
      aria-label="Remove"
      className={classes.removeButton}
      onClick={removeable.onRemove}
    >
      <Icon name="close" size={iconSizeMap[size]} />
    </button>
  );
  const label = <span className={classes.label}>{children}</span>;

  if (rootIsButton) {
    return (
      <button type="button" className={rootClassName} onClick={onClick}>
        {prefixNode}
        {label}
        {suffixNode}
      </button>
    );
  }

  if (segmentedButton) {
    return (
      <div className={rootClassName}>
        {prefixInteractive && prefixNode}
        <button
          type="button"
          className={classes.centerButton}
          onClick={onClick}
        >
          {prefix && !prefixInteractive && prefixNode}
          {label}
          {suffix && !suffixInteractive && suffixNode}
        </button>
        {suffixInteractive && suffixNode}
        {removeNode}
      </div>
    );
  }

  // Not clickable: a plain container.
  return (
    <div className={rootClassName}>
      {prefixNode}
      {label}
      {suffixNode}
      {removeNode}
    </div>
  );
};
