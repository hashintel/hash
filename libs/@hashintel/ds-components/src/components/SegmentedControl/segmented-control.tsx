import { SegmentGroup } from "@ark-ui/react/segment-group";
import { Fragment } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { resolveAutoFocusProps } from "../../util/form-shared";
import { getGroupFocusProps } from "../../util/radio-checkbox-group-shared";
import { iconSizeMap } from "../Button/button";
import { useFieldId } from "../Form/field-id-context";
import { Icon, type IconName } from "../Icon/icon";
import { Tooltip } from "../Tooltip/tooltip";
import { styles } from "./segmented-control.recipe";

import type { FormInputSize, SharedInputProps } from "../../util/form-shared";

export type SegmentedControlItem = (
  | { label: React.ReactNode; iconName?: IconName }
  | {
      iconName: IconName;
    }
) & {
  value: string;
  disabled?: boolean;
  /** Shown on hover/focus of the segment. Also serves as the accessible label of icon-only segments. */
  tooltip?: string;
  tooltipOptions?: Omit<
    React.ComponentProps<typeof Tooltip>,
    "children" | "content"
  >;
};

export type SegmentedControlProps = {
  /** How the segments are arranged (defaults to `horizontal`) */
  layout?: "horizontal" | "vertical";
  /** The size (height) of the control */
  size?: FormInputSize;
  /** The selectable segments */
  items?: SegmentedControlItem[];
} & Omit<SharedInputProps<HTMLInputElement, string>, "required" | "invalid"> &
  React.AriaAttributes;

export const SegmentedControl = ({
  layout = "horizontal",
  size = "md",
  items = [],
  className,
  name,
  value,
  onChange,
  onFocus,
  onBlur,
  testId,
  htmlForId,
  ref,
  inputRef,
  autoFocus,
  disabled,
  ...ariaProps
}: SegmentedControlProps) => {
  const fieldIdFromContext = useFieldId();
  const inputId = htmlForId ?? fieldIdFromContext ?? undefined;

  // The checked segment's hidden radio is the group's single tab stop, so it
  // carries the external id, `inputRef` and `autoFocus`. Falls back to the
  // first enabled segment when nothing is selected.
  const selectedIndex = items.findIndex((item) => item.value === value);
  const firstEnabledIndex = items.findIndex((item) => item.disabled !== true);
  const primaryIndex =
    selectedIndex === -1 ? Math.max(0, firstEnabledIndex) : selectedIndex;
  const primaryValue = items[primaryIndex]?.value;

  const classes = styles({ size, layout });

  return (
    <SegmentGroup.Root
      value={value}
      onValueChange={(details) => {
        if (details.value !== null) {
          onChange(details.value);
        }
      }}
      name={name}
      disabled={disabled}
      orientation={layout}
      ids={
        inputId === undefined
          ? undefined
          : {
              itemHiddenInput: (itemValue) =>
                itemValue === primaryValue
                  ? inputId
                  : `${inputId}-${itemValue}`,
            }
      }
      data-testid={testId}
      ref={ref as React.Ref<HTMLDivElement>}
      className={cx(classes.root, className)}
      {...getGroupFocusProps({ onFocus, onBlur })}
      {...ariaProps}
    >
      <SegmentGroup.Indicator className={classes.indicator} />
      {items.map((item, index) => {
        const isPrimary = index === primaryIndex;
        const isIconOnly = !("label" in item);

        const segment = (
          <SegmentGroup.Item
            value={item.value}
            disabled={item.disabled}
            className={cx(classes.item, isIconOnly && classes.iconOnlyItem)}
          >
            {"iconName" in item && item.iconName !== undefined && (
              <Icon
                name={item.iconName}
                size={iconSizeMap[size]}
                className={classes.icon}
                alt={isIconOnly ? (item.tooltip ?? item.value) : undefined}
              />
            )}
            {"label" in item && (
              <SegmentGroup.ItemText className={classes.itemText}>
                {item.label}
              </SegmentGroup.ItemText>
            )}
            <SegmentGroup.ItemHiddenInput
              ref={isPrimary ? inputRef : undefined}
              {...(autoFocus === "never" || isPrimary
                ? resolveAutoFocusProps(autoFocus)
                : undefined)}
            />
          </SegmentGroup.Item>
        );

        if (item.tooltip === undefined) {
          return <Fragment key={item.value}>{segment}</Fragment>;
        }

        const { className: tooltipClassName, ...tooltipOptions } =
          item.tooltipOptions ?? {};

        return (
          <Tooltip
            key={item.value}
            content={item.tooltip}
            {...tooltipOptions}
            className={cx(classes.tooltipTrigger, tooltipClassName)}
          >
            {segment}
          </Tooltip>
        );
      })}
    </SegmentGroup.Root>
  );
};
