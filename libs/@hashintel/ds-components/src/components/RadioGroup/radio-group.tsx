import { RadioGroup as ArkRadioGroup } from "@ark-ui/react/radio-group";
import { useId } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { Radio } from "../Radio/radio";
import { styles } from "./radio-group.recipe";

import type { SharedInputProps } from "../../util/form-shared";

/** How the options are laid out within the group. */
export type RadioGroupLayout = "block" | "inline" | "blockWithBorder";

/**
 * A single selectable option. Accepts everything {@link Radio} does, except the
 * props the group controls on its behalf (`size`, `name`, selection state and
 * the id used to wire the label to the input).
 */
export type RadioGroupOption<ValueType extends string = string> = Omit<
  React.ComponentProps<typeof Radio>,
  "size" | "onChange" | "value" | "name" | "autoFocus" | "htmlForId"
> & {
  /** The value reported to `onChange` when this option is selected */
  value: ValueType;
};

export type RadioGroupProps<ValueType extends string = string> = {
  /** How the options are arranged (defaults to `block`) */
  layout?: RadioGroupLayout;
  /** The selectable options */
  items: RadioGroupOption<ValueType>[];
} & Omit<
  SharedInputProps<HTMLInputElement, ValueType>,
  "inputRef" | "invalid"
> &
  React.AriaAttributes;

/**
 * A group of mutually-exclusive {@link Radio} options.
 *
 * Built on Ark UI's `RadioGroup` for the `radiogroup` semantics, orientation
 * and per-item state, while each option is rendered by composing the existing
 * `Radio` component via `asChild` on `RadioGroup.Item`.
 *
 * Selection is driven by the native radio inputs that `Radio` renders (they
 * share a `name`, so the browser handles single-selection and arrow-key
 * navigation) and is kept controlled through `value`/`onChange`.
 */
export const RadioGroup = <ValueType extends string>({
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
      onFocus={onFocus}
      onBlur={onBlur}
      data-testid={testId}
      ref={ref as React.Ref<HTMLDivElement>}
      className={cx(styles({ layout }), className)}
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
              required={required}
              disabled={itemIsDisabled}
              value={value === optionValue}
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
