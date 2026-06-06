import { createListCollection } from "@ark-ui/react/collection";
import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect } from "@ark-ui/react/select";
import { useMemo, useRef } from "react";
import { useMergeRefs } from "use-callback-ref";

import { cx } from "@hashintel/ds-helpers/css";

import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../SelectableList/selectable-list";
import { baseInputRecipe } from "../TextInput/base-input.recipe";
import { InputConnector } from "../TextInput/input-connector";
import { selectRecipe } from "./select.recipe";

import type {
  FormInputSize,
  FormInputWidth,
  SharedInputProps,
} from "../../util/form-shared";
import type { IconName } from "../Icon/icon";

export type SelectItem = {
  value: string;
  children: string; // Visible label
  disabled?: boolean;
  selectedStyle?: Item["selectedStyle"];
};

export type SelectProps = {
  /** An optional placeholder shown when no value is selected */
  placeholder?: string;
  /** Disable editing of the input. Unlike disabled this strips the input styles and displays the value as text */
  readonly?: boolean;
  /** Whether the input is in a loading state */
  loading?: boolean;
  /** subtle inputs have no border and display similarly to inline text */
  variant?: "default" | "subtle";
  /** set the alignment of the text in the input */
  align?: "left" | "center" | "right";
  /** A set of standard widths to choose for the input. You can also set the width with css when aligning with other inputs is not required. */
  width?: FormInputWidth;
  /** Hide the dropdown arrow */
  hideArrow?: boolean;
  /** Optional element or button to include at the beginning of an input */
  prefix?: Prefix;
  /** Show the input as connected to another input. To connect 2 inputs, both connectToLeftInput and connectToRightInput should be enabled on both connected inputs. subtle inputs + readonly inputs will not be connected */
  connectToLeftInput?: boolean;
  /** Show the input as connected to another input. To connect 2 inputs, both connectToLeftInput and connectToRightInput should be enabled on both connected inputs. subtle inputs + readonly inputs will not be connected */
  connectToRightInput?: boolean;
  /** Set to allow the input to be cleared. As the component is controlled you must clear the value manually with onClear. */
  clearable?: {
    clearable: boolean;
    onClear: () => void;
  };
  onClick?: React.MouseEventHandler<Element>;
  onKeyDown?: React.KeyboardEventHandler<Element>;
  tabIndex?: number;
  items: Array<ItemOrGroup<SelectItem>>;
} & SharedInputProps<
  HTMLElement,
  string | null | undefined,
  (value: string) => void
> &
  React.AriaAttributes;

type BaseInputSlots = ReturnType<typeof baseInputRecipe>;
type Prefix =
  | { iconName: IconName }
  | { text: string }
  | { content: React.ReactNode };

const isIconPrefix = (val: Prefix): val is { iconName: IconName } =>
  "iconName" in val;

const isTextPrefix = (val: Prefix): val is { text: string } => "text" in val;

const iconSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xs",
  xs: "xs",
  sm: "sm",
  md: "md",
  lg: "md",
};

const loadingSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xs",
  xs: "xs",
  sm: "sm",
  md: "sm",
  lg: "md",
};

function renderPrefix(
  adornment: Prefix,
  size: FormInputSize,
  classes: BaseInputSlots,
): React.ReactNode {
  const content = isIconPrefix(adornment) ? (
    <Icon name={adornment.iconName} size={iconSizeMap[size]} />
  ) : isTextPrefix(adornment) ? (
    adornment.text
  ) : (
    adornment.content
  );
  return (
    <span
      className={cx(classes.prefix, classes.adornment, classes.adornmentText)}
      data-part="adornment-text"
    >
      {content}
    </span>
  );
}

function findSelectItem(
  items: Array<ItemOrGroup<SelectItem>>,
  value: string | null | undefined,
): SelectItem | undefined {
  if (value == null) {
    return undefined;
  }
  for (const entry of items) {
    if ("items" in entry) {
      const found = entry.items.find((it) => it.value === value);
      if (found) {
        return found;
      }
    } else if (entry.value === value) {
      return entry;
    }
  }
  return undefined;
}

function mapToMenuItems(
  items: Array<ItemOrGroup<SelectItem>>,
): Array<ItemOrGroup<Item>> {
  const toItem = (it: SelectItem): Item => ({
    id: it.value,
    text: it.children,
    disabled: it.disabled,
    selectedStyle: it.selectedStyle,
    nestedItems: undefined,
  });
  return items.map((entry) =>
    "items" in entry
      ? { id: entry.id, label: entry.label, items: entry.items.map(toItem) }
      : toItem(entry),
  );
}

function flattenItems(items: Array<ItemOrGroup<Item>>): Item[] {
  const flat: Item[] = [];
  for (const entry of items) {
    if ("items" in entry) {
      flat.push(...entry.items);
    } else {
      flat.push(entry);
    }
  }
  return flat;
}

export const Select = ({
  placeholder,
  readonly,
  loading,
  variant = "default",
  align = "left",
  width = "fullWidth",
  hideArrow,
  prefix,
  connectToLeftInput,
  connectToRightInput,
  clearable,
  onClick,
  onKeyDown,
  tabIndex,
  items,
  className,
  name,
  value,
  onChange,
  onFocus,
  onBlur,
  size = "md",
  testId,
  htmlForId,
  ref,
  inputRef,
  disabled,
  required,
  invalid,
  autoFocus,
  ...ariaProps
}: SelectProps) => {
  const internalRef = useRef<HTMLDivElement>(null);
  const mergedTriggerRef = useMergeRefs([
    internalRef,
    ...(inputRef ? [inputRef as unknown as React.Ref<HTMLDivElement>] : []),
  ]);
  const fieldIdFromContext = useFieldId();
  const inputId = htmlForId ?? fieldIdFromContext ?? undefined;

  const showClear = !!(clearable && !disabled);
  const hasIcons = !!loading || showClear || !hideArrow;
  const connectsLeft = connectToLeftInput && variant === "default";
  const connectsRight = connectToRightInput && variant === "default";

  const selectedItem = findSelectItem(items, value);
  const displayText = selectedItem?.children ?? "";

  const menuItems = useMemo(() => mapToMenuItems(items), [items]);
  const collection = useMemo(
    () =>
      createListCollection<Item>({
        items: flattenItems(menuItems),
        itemToValue: (item) => item.id,
        itemToString: (item) => item.id,
        isItemDisabled: (item) => !!item.disabled,
      }),
    [menuItems],
  );

  const selectClasses = selectRecipe({ variant });

  const classes = baseInputRecipe({
    variant,
    size,
    align,
    width,
    invalid: !!invalid,
    disabled: !!disabled,
    loading: !!loading,
    hasIcons,
    connectsLeft,
    connectsRight,
    willClear:
      showClear &&
      clearable.clearable &&
      (value === null || value === undefined || value === ""),
  });

  if (readonly) {
    return (
      <span
        ref={ref}
        className={cx(classes.readonly, className)}
        data-testid={testId}
        {...ariaProps}
      >
        {displayText}
      </span>
    );
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cx(classes.wrapper, className)}
    >
      <ArkSelect.Root
        collection={collection}
        value={value != null && value !== "" ? [value] : []}
        onValueChange={({ value: nextValue }) => {
          const next = nextValue[0];
          if (next !== undefined) {
            onChange(next);
          }
        }}
        disabled={disabled}
        invalid={invalid}
        required={required}
        name={name}
      >
        <ArkSelect.Trigger
          asChild
          id={inputId}
          autoFocus={autoFocus === true ? true : undefined}
        >
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- ark-ui sets button role / keyboard handlers via asChild on Select.Trigger */}
          <div
            ref={mergedTriggerRef}
            className={cx(selectClasses.trigger, classes.root)}
            data-testid={testId}
            tabIndex={tabIndex}
            data-name={name}
            onClick={onClick}
            onKeyDown={onKeyDown}
            onFocus={
              onFocus as React.FocusEventHandler<HTMLDivElement> | undefined
            }
            onBlur={
              onBlur as React.FocusEventHandler<HTMLDivElement> | undefined
            }
            {...ariaProps}
          >
            {prefix != null && renderPrefix(prefix, size, classes)}
            {connectToLeftInput && variant === "default" && (
              <InputConnector
                className={cx(
                  classes.connector,
                  classes.connectLeft,
                  prefix && classes.connectAdornment,
                )}
                data-part="connector"
              />
            )}

            <div className={classes.inputWrapper}>
              <span
                className={cx(
                  classes.input,
                  selectedItem
                    ? selectClasses.value
                    : selectClasses.placeholder,
                )}
                data-part="value"
              >
                {displayText !== "" ? displayText : (placeholder ?? " ")}
              </span>
              {showClear && (
                <button
                  type="button"
                  data-part="clear"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    clearable.onClear();
                    internalRef.current?.focus();
                  }}
                  className={cx(
                    classes.clear,
                    (!clearable.clearable || !value) && classes.hideClear,
                  )}
                  aria-label="Clear input"
                >
                  <Icon
                    name="close"
                    size={iconSizeMap[size]}
                    className={classes.clearIcon}
                  />
                </button>
              )}
            </div>

            {loading && (
              <span className={classes.loading} data-part="loading">
                <LoadingSpinner size={loadingSizeMap[size]} variant="bars" />
              </span>
            )}

            {!hideArrow && !loading && (
              <span
                className={selectClasses.arrow}
                data-part="arrow"
                aria-hidden
              >
                <Icon name="chevronDown" size={iconSizeMap[size]} />
              </span>
            )}

            {connectToRightInput && variant === "default" && (
              <InputConnector
                className={cx(classes.connector, classes.connectRight)}
                data-part="connector"
              />
            )}
          </div>
        </ArkSelect.Trigger>
        <Portal>
          <ArkSelect.Positioner>
            <SelectableList
              as="Select"
              items={menuItems}
              selected={value != null && value !== "" ? [value] : []}
              size={size}
            />
          </ArkSelect.Positioner>
        </Portal>
      </ArkSelect.Root>
    </div>
  );
};
