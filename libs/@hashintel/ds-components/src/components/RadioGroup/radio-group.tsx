import { RadioGroup as ArkRadioGroup } from "@ark-ui/react/radio-group";
import { useId } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import {
  getGroupFocusProps,
  styles,
} from "../../util/radio-checkbox-group-shared";
import { Radio } from "../Radio/radio";

import type { SharedInputProps } from "../../util/form-shared";

type RadioGroupProps<ValueType extends string = string> = {
  /** How the options are arranged (defaults to `block`) */
  layout?: "block" | "inline" | "blockWithBorder";
  /** The selectable options */
  items: Array<
    Omit<
      React.ComponentProps<typeof Radio>,
      | "size"
      | "onChange"
      | "value"
      | "name"
      | "autoFocus"
      | "htmlForId"
      | "invalid"
      | "required"
    > & { value: ValueType }
  >;
} & Omit<SharedInputProps<HTMLInputElement, NoInfer<ValueType>>, "inputRef"> &
  React.AriaAttributes;

export const RadioGroup = <const ValueType extends string>({
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
  invalid,
  name,
  ...ariaProps
}: RadioGroupProps<ValueType>) => {
  // A stable `name` groups the underlying radio inputs so the browser enforces
  // single-selection and native arrow-key navigation between them.
  const generatedName = useId();
  const groupName = name ?? generatedName;

  // Ark UI's `RadioGroup.Item` forces the label's `htmlFor` to the id it
  // generates for the (otherwise hidden) input. Since we render `Radio`'s own
  // input instead, we override that id generator and reuse the same id for
  // `Radio`'s input, keeping the label correctly associated with the input.
  const idPrefix = useId();
  const itemInputId = (optionValue: string) => `${idPrefix}${optionValue}`;

  // Focus the selected option on mount (or the first option if none is set).
  const selectedIndex = items.findIndex((item) => item.value === value);
  const autoFocusIndex = selectedIndex === -1 ? 0 : selectedIndex;

  return (
    <ArkRadioGroup.Root
      value={value}
      onValueChange={(details) => {
        if (details.value !== null) {
          onChange(details.value as ValueType);
        }
      }}
      name={groupName}
      disabled={disabled}
      orientation={layout === "inline" ? "horizontal" : "vertical"}
      ids={{ itemHiddenInput: itemInputId }}
      data-testid={testId}
      ref={ref as React.Ref<HTMLDivElement>}
      className={cx(styles({ layout }), className)}
      required={required}
      invalid={invalid}
      {...getGroupFocusProps({ onFocus, onBlur })}
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
          <ArkRadioGroup.Item
            key={optionValue}
            value={optionValue}
            disabled={itemIsDisabled}
            asChild
          >
            <Radio
              {...itemProps}
              size={size}
              name={groupName}
              htmlForId={itemInputId(optionValue)}
              htmlValue={optionValue}
              disabled={itemIsDisabled}
              value={value === optionValue}
              invalid={invalid && value === optionValue}
              onChange={(checked) => {
                if (checked) {
                  onChange(optionValue);
                }
              }}
              autoFocus={autoFocus && index === autoFocusIndex}
            />
          </ArkRadioGroup.Item>
        );
      })}
    </ArkRadioGroup.Root>
  );
};
