import { CheckboxGroup as ArkCheckboxGroup } from "@ark-ui/react/checkbox";
import { useId } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import {
  getGroupFocusProps,
  styles,
} from "../../util/radio-checkbox-group-shared";
import { Checkbox } from "../Checkbox/checkbox";

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
  maxSelectable?: number;
} & Omit<SharedInputProps<HTMLInputElement, NoInfer<ValueType>[]>, "inputRef"> &
  React.AriaAttributes;

export const CheckboxGroup = <const ValueType extends string>({
  layout = "block",
  items,
  disabled,
  invalid,
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
  maxSelectable,
  ...ariaProps
}: CheckboxGroupProps<ValueType>) => {
  // A stable, shared `name` groups the underlying inputs for form submission.
  const generatedName = useId();
  const groupName = name ?? generatedName;

  const selectedValues = new Set(value);
  const isRequired = !!required || items.some((item) => item.required);
  const isInvalid = !!invalid || items.some((item) => item.invalid);
  const hasSelection = items.some((item) => selectedValues.has(item.value));

  return (
    <ArkCheckboxGroup
      name={groupName}
      disabled={disabled}
      // `aria-required` isn't part of the `group` role's ARIA contract, but is
      // the conventional signal that a selection is required for the group.
      aria-required={isRequired ? true : undefined}
      invalid={isInvalid ? true : undefined}
      data-testid={testId}
      ref={ref as React.Ref<HTMLDivElement>}
      maxSelectedValues={maxSelectable}
      className={cx(styles({ layout }), className)}
      {...getGroupFocusProps({ onFocus, onBlur })}
      {...ariaProps}
    >
      {items.map((item, index) => {
        const {
          value: optionValue,
          disabled: itemDisabled,
          required: itemRequired,
          ...itemProps
        } = item;
        const itemIsDisabled = disabled === true || itemDisabled === true;
        // Native checkboxes have no "at least one of the group" constraint, so when
        // the group is required we mark every option `required` while nothing is
        // selected. That makes the group invalid (blocking submission) until one box
        // is checked, at which point none of them need to be required anymore.
        const itemIsRequired =
          itemRequired === true || (required === true && !hasSelection);

        return (
          <Checkbox
            key={optionValue}
            {...itemProps}
            size={size}
            name={groupName}
            disabled={itemIsDisabled}
            required={itemIsRequired}
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
