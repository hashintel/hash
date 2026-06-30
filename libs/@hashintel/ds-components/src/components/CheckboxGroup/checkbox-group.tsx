import { CheckboxGroup as ArkCheckboxGroup } from "@ark-ui/react/checkbox";
import { useId } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { Checkbox } from "../Checkbox/checkbox";
import { styles } from "./checkbox-group.recipe";

import type { SharedInputProps } from "../../util/form-shared";

type CheckboxGroupProps<ValueType extends string = string> = {
  /** How the options are arranged (defaults to `block`) */
  layout?: "block" | "inline" | "blockWithBorder";
  /** The selectable options */
  items: Array<
    Omit<
      React.ComponentProps<typeof Checkbox>,
      "size" | "onChange" | "value" | "name" | "autoFocus" | "htmlForId"
    > & { value: ValueType }
  >;
} & Omit<
  SharedInputProps<HTMLInputElement, NoInfer<ValueType>[]>,
  "inputRef" | "invalid"
> &
  React.AriaAttributes;

export const CheckboxGroup = <const ValueType extends string>({
  layout = "block",
  items,
  disabled,
  className,
  value,
  onChange,
  onFocus,
  onBlur,
  ref,
  required,
  testId,
  size = "md",
  autoFocus,
  name,
  ...ariaProps
}: CheckboxGroupProps<ValueType>) => {
  // A stable, shared `name` groups the underlying inputs for form submission.
  const generatedName = useId();
  const groupName = name ?? generatedName;

  const selectedValues = new Set(value);

  // Focus events bubble, so moving between options would otherwise fire blur
  // then focus on the group itself. These only report focus genuinely entering
  // or leaving the group, i.e. when the related element is outside it.
  const handleGroupFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onFocus?.(event as unknown as React.FocusEvent<HTMLInputElement>);
    }
  };

  const handleGroupBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onBlur?.(event as unknown as React.FocusEvent<HTMLInputElement>);
    }
  };

  // Pressing an option's label would otherwise blur the currently-focused
  // option out to `<body>` (where `relatedTarget` is null) before `click`
  // focuses the pressed option — surfacing as the group losing then regaining
  // focus. Preventing the default press behaviour keeps the current option
  // focused until `click` moves focus straight to the pressed option, so
  // `relatedTarget` stays within the group and the transient never happens.
  const handleGroupMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("label")) {
      event.preventDefault();
    }
  };

  return (
    <ArkCheckboxGroup
      name={groupName}
      disabled={disabled}
      // `aria-required` isn't part of the `group` role's ARIA contract, but is
      // the conventional signal that a selection is required for the group.
      aria-required={required ? true : undefined}
      data-testid={testId}
      ref={ref as React.Ref<HTMLDivElement>}
      className={cx(styles({ layout }), className)}
      onMouseDown={handleGroupMouseDown}
      onFocus={handleGroupFocus}
      onBlur={handleGroupBlur}
      {...ariaProps}
    >
      {items.map((item, index) => {
        const {
          value: optionValue,
          disabled: itemDisabled,
          ...itemProps
        } = item;
        const itemIsDisabled = disabled === true || itemDisabled === true;

        return (
          <Checkbox
            key={optionValue}
            {...itemProps}
            size={size}
            name={groupName}
            disabled={itemIsDisabled}
            value={selectedValues.has(optionValue)}
            htmlValue={optionValue}
            onChange={(checked) => {
              onChange(
                checked
                  ? [...value, optionValue]
                  : value.filter((candidate) => candidate !== optionValue),
              );
            }}
            autoFocus={autoFocus && index === 0}
          />
        );
      })}
    </ArkCheckboxGroup>
  );
};
