import { createListCollection } from "@ark-ui/react/collection";
import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect } from "@ark-ui/react/select";
import { useMemo, useRef } from "react";
import { useMergeRefs } from "use-callback-ref";

import { cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../SelectableList/selectable-list";
import { getItemId } from "../SelectableList/selectable-list-util";
import { InputConnector } from "../TextInput/input-connector";
import { selectRecipe } from "./select.recipe";

import type {
  FormInputSize,
  FormInputWidth,
  SharedInputProps,
} from "../../util/form-shared";
import type { IconName } from "../Icon/icon";

export type SelectItem<TValue extends string = string> = {
  value: TValue;
  text: string; // Visible label
  disabled?: boolean;
};

type SelectBaseProps<TValue extends string> = {
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
  items: ReadonlyArray<ItemOrGroup<SelectItem<TValue>>>;
  /** Custom renderer for items in the dropdown. Defaults to the item's `text`. */
  renderItem?: (value: TValue) => React.ReactNode;
  /** Custom renderer for the selected value in the trigger. Defaults to `renderItem`, or the item's `text` if neither is provided. */
  renderSelectedItem?: (value: TValue) => React.ReactNode;
} & Omit<
  SharedInputProps<HTMLButtonElement, string | null | undefined>,
  "value" | "onChange" | "required"
> &
  React.AriaAttributes;

export type SelectProps<TValue extends string = string> =
  SelectBaseProps<TValue> &
    (
      | {
          required: true;
          value: NoInfer<TValue>;
          onChange: (value: NoInfer<TValue>) => void;
        }
      | {
          required?: false;
          value: NoInfer<TValue> | null | undefined;
          onChange: (value: NoInfer<TValue> | null | undefined) => void;
        }
    );

type SelectSlots = ReturnType<typeof selectRecipe>;
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
  classes: SelectSlots,
): React.ReactNode {
  const content = isIconPrefix(adornment) ? (
    <Icon name={adornment.iconName} size={iconSizeMap[size]} />
  ) : isTextPrefix(adornment) ? (
    adornment.text
  ) : (
    adornment.content
  );
  return (
    <span className={cx(classes.prefix, classes.adornment)}>{content}</span>
  );
}

function findSelectItem<TValue extends string>(
  items: ReadonlyArray<ItemOrGroup<SelectItem<TValue>>>,
  value: TValue | null | undefined,
): SelectItem<TValue> | undefined {
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

function mapToMenuItems<TValue extends string>(
  items: ReadonlyArray<ItemOrGroup<SelectItem<TValue>>>,
  renderItem: (value: TValue) => React.ReactNode,
): Array<ItemOrGroup<Item>> {
  const toItem = (it: SelectItem<TValue>): Item => ({
    id: it.value,
    text: renderItem(it.value),
    disabled: it.disabled,
    selectedStyle: "tick",
    nestedItems: undefined,
    onClick: () => {},
  });
  return items.map((entry) =>
    "items" in entry
      ? { id: entry.id, label: entry.label, items: entry.items.map(toItem) }
      : toItem(entry),
  );
}

const NONE_VALUE = "__select_none__";

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

export const Select = <TValue extends string>({
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
  renderItem,
  renderSelectedItem,
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
}: SelectProps<TValue>) => {
  const portalContainerRef = usePortalContainerRef();
  const internalRef = useRef<HTMLButtonElement>(null);
  const mergedTriggerRef = useMergeRefs([
    internalRef,
    ...(inputRef ? [inputRef as unknown as React.Ref<HTMLButtonElement>] : []),
  ]);
  const fieldIdFromContext = useFieldId();
  const inputId = htmlForId ?? fieldIdFromContext ?? undefined;

  const showClear = !!(clearable && !disabled);
  const connectsLeft = connectToLeftInput && variant === "default";
  const connectsRight = connectToRightInput && variant === "default";

  const selectedItem = findSelectItem(items, value);

  const resolvedRenderItem = useMemo<(value: TValue) => React.ReactNode>(
    () =>
      renderItem ?? ((val: TValue) => findSelectItem(items, val)?.text ?? val),
    [renderItem, items],
  );
  const resolvedRenderSelectedItem = renderSelectedItem ?? resolvedRenderItem;

  const isOptional = required !== true;
  const menuItems = useMemo(() => {
    const mapped = mapToMenuItems(items, resolvedRenderItem);
    if (!isOptional) {
      return mapped;
    }
    const noneItem: Item = {
      id: NONE_VALUE,
      text: "\u200B",
      nestedItems: undefined,
      onClick: () => {},
    };
    return [noneItem, ...mapped];
  }, [items, isOptional, resolvedRenderItem]);
  const collection = useMemo(
    () =>
      createListCollection<Item>({
        items: flattenItems(menuItems),
        itemToValue: (item) => getItemId(item),
        itemToString: (item) => getItemId(item),
        isItemDisabled: (item) => !!item.disabled,
      }),
    [menuItems],
  );

  const classes = selectRecipe({
    variant,
    size,
    align,
    width,
    invalid: !!invalid,
    disabled: !!disabled,
    loading: !!loading,
    hideArrow: !!hideArrow,
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
        {selectedItem ? resolvedRenderSelectedItem(selectedItem.value) : ""}
      </span>
    );
  }

  return (
    <ArkSelect.Root
      collection={collection}
      value={value != null && value !== "" ? [value] : []}
      onValueChange={({ value: nextValue }) => {
        const next = nextValue[0];
        if (next === NONE_VALUE) {
          (onChange as (value: null) => void)(null);
          return;
        }
        if (next !== undefined) {
          onChange(next as TValue);
        }
      }}
      disabled={disabled}
      invalid={invalid}
      required={required}
      name={name}
      loopFocus={false}
      lazyMount
      unmountOnExit
      ref={ref as React.Ref<HTMLDivElement>}
      className={cx(classes.wrapper, className)}
    >
      <ArkSelect.HiddenSelect />
      <div className={classes.select}>
        {prefix != null && renderPrefix(prefix, size, classes)}
        {connectToLeftInput && variant === "default" && (
          <InputConnector
            className={cx(classes.connector, classes.connectLeft)}
            data-part="connector"
          />
        )}

        <div className={classes.triggerWrapper}>
          <ArkSelect.Trigger
            id={inputId}
            autoFocus={autoFocus === true ? true : undefined}
            ref={mergedTriggerRef as React.Ref<HTMLButtonElement>}
            className={classes.trigger}
            data-part="trigger"
            data-testid={testId}
            tabIndex={tabIndex}
            onClick={onClick}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            {...ariaProps}
          >
            {selectedItem
              ? resolvedRenderSelectedItem(selectedItem.value)
              : (placeholder ?? " ")}
          </ArkSelect.Trigger>
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

        {connectToRightInput && variant === "default" && (
          <InputConnector
            className={cx(classes.connector, classes.connectRight)}
            data-part="connector"
          />
        )}
      </div>
      <Portal container={portalContainerRef}>
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
  );
};
