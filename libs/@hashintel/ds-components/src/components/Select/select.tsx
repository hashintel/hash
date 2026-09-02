import { createListCollection } from "@ark-ui/react/collection";
import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect } from "@ark-ui/react/select";
import { Fragment, useCallback, useId, useMemo, useRef } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { resolveAutoFocusProps } from "../../util/form-shared";
import { usePortalContainerRef } from "../../util/portal-container-context";
import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../Menu/SelectableList/selectable-list";
import { getItemId } from "../Menu/SelectableList/selectable-list-util";
import { InputConnector } from "../TextInput/input-connector";
import {
  onlyButtonRecipe,
  selectRecipe,
  suffixDefaultContentClass,
} from "./select.recipe";

import type {
  FormInputSize,
  FormInputWidth,
  SharedInputProps,
  Tone,
} from "../../util/form-shared";
import type { IconName } from "../Icon/icon";

export type SelectItem<TValue extends string = string> = {
  value: TValue;
  text: string; // Visible label
  disabled?: boolean;
};

export type MultiSelectItem<TValue extends string = string> =
  SelectItem<TValue> & {
    /** How selection is indicated for this item in the dropdown. Defaults to `checkbox`. */
    variant?: "checkbox" | "tick" | "highlight";
    /** The tone of this item's selected indicator (checkbox fill, tick or highlight color). Defaults to `neutral`. */
    tone?: Exclude<Tone, "warning" | "success">;
    /** Optional content aligned to the right of the item in the dropdown */
    suffix?: React.ReactNode;
    /** Show an "Only" button while the item is hovered, which sets the selection to just this item. It renders in the suffix position, replacing `suffix` while visible. */
    showOnlyButton?: boolean;
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
  /** Custom renderer for items in the dropdown. Defaults to the item's `text`. Note that if connectToLeftInput or connectToRightInput the height of the rendered selected item is clamped to the default height of select so that it correctly aligns. */
  renderItem?: (value: TValue) => React.ReactNode;
  /** The input ref - this is different to the ref, which is the containing element. This refers instead to a hidden select element (the actual ui uses a button to handle custom styling). Use this to access the internal select state and/or to set focus. */
  inputRef?: React.Ref<HTMLSelectElement>;
  /** Optional custom message for scenarios where there are no items available to show */
  emptyState?: React.ReactNode;
} & Omit<
  SharedInputProps<HTMLButtonElement, string | null | undefined>,
  "value" | "onChange" | "required" | "inputRef"
> &
  React.AriaAttributes;

type SelectSingleProps<TValue extends string> = {
  /** Set to allow selecting multiple values */
  multiple?: false;
  maxItems?: never;
  items: ReadonlyArray<ItemOrGroup<SelectItem<TValue>>>;
  /** Custom renderer for the selected value in the trigger. Defaults to `renderItem`, or the item's `text` if neither is provided. Note that if connectToLeftInput or connectToRightInput the height of the rendered selected item is clamped to the default height of select so that it correctly aligns. */
  renderSelectedItem?: (value: TValue) => React.ReactNode;
} & (
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

type SelectMultipleProps<TValue extends string> = {
  /** Set to allow selecting multiple values. The dropdown stays open while selecting, and items indicate selection with a checkbox unless they set their own `variant`. */
  multiple: true;
  /** The maximum number of values that can be selected. Once reached, unselected items are disabled until a value is deselected. */
  maxItems?: number;
  items: ReadonlyArray<ItemOrGroup<MultiSelectItem<TValue>>>;
  /** Custom renderer for the selected values in the trigger. Defaults to rendering each selected value with `renderItem` (or the item's `text`), comma-separated. Note that if connectToLeftInput or connectToRightInput the height of the rendered selected items is clamped to the default height of select so that it correctly aligns. */
  renderSelectedItem?: (values: TValue[]) => React.ReactNode;
  required?: boolean;
  value: ReadonlyArray<NoInfer<TValue>>;
  onChange: (value: Array<NoInfer<TValue>>) => void;
};

export type SelectProps<TValue extends string = string> =
  SelectBaseProps<TValue> &
    (SelectSingleProps<TValue> | SelectMultipleProps<TValue>);

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
  items: ReadonlyArray<ItemOrGroup<MultiSelectItem<TValue>>>,
  renderItem: (value: TValue) => React.ReactNode,
  options: {
    multiple: boolean;
    /** When defined, values outside the set are disabled (a multi select at `maxItems`) */
    selectableValues: ReadonlySet<string> | undefined;
    /** Sets the selection to just the given value — backs the per-item "Only" button */
    selectOnly: (value: TValue) => void;
  },
): Array<ItemOrGroup<Item>> {
  const toSuffix = (it: MultiSelectItem<TValue>): React.ReactNode => {
    if (!it.showOnlyButton || it.disabled) {
      return it.suffix;
    }
    return (
      <>
        {it.suffix !== undefined && (
          <span className={suffixDefaultContentClass}>{it.suffix}</span>
        )}
        <button
          type="button"
          className={onlyButtonRecipe({
            tone: it.tone === "brand" ? "brand" : "neutral",
          })}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            options.selectOnly(it.value);
          }}
        >
          Only
        </button>
      </>
    );
  };
  const toItem = (it: MultiSelectItem<TValue>): Item => ({
    id: it.value,
    text: renderItem(it.value),
    disabled:
      it.disabled ||
      (options.selectableValues !== undefined &&
        !options.selectableValues.has(it.value)),
    selectedStyle: options.multiple ? (it.variant ?? "checkbox") : "tick",
    selectedTone: it.tone,
    suffix: toSuffix(it),
    subItems: undefined,
    onClick: () => {},
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
  multiple,
  maxItems,
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
  emptyState,
  ...ariaProps
}: SelectProps<TValue>) => {
  const portalContainerRef = usePortalContainerRef();
  const internalRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLDivElement>(null);
  const fieldIdFromContext = useFieldId();
  const inputId = htmlForId ?? fieldIdFromContext ?? undefined;
  // Per-instance sentinel for the "clear" row — guaranteed not to collide
  // with any consumer-supplied item value.
  const noneValue = useId();

  const showClear = !!(clearable && !disabled);
  const connectsLeft = connectToLeftInput && variant === "default";
  const connectsRight = connectToRightInput && variant === "default";

  const selectedValues = useMemo<TValue[]>(() => {
    if (multiple) {
      return [...(value as ReadonlyArray<TValue>)];
    }
    const single = value as TValue | null | undefined;
    return single != null && single !== "" ? [single] : [];
  }, [multiple, value]);
  const hasSelection = selectedValues.length > 0;

  const orphans = useMemo<Array<SelectItem<TValue>>>(
    () =>
      selectedValues
        .filter((val) => !findSelectItem(items, val))
        .map((val) => ({ value: val, text: val, disabled: true })),
    [items, selectedValues],
  );

  const effectiveItems = useMemo<
    ReadonlyArray<ItemOrGroup<MultiSelectItem<TValue>>>
  >(() => {
    if (orphans.length === 0 || (loading && items.length === 0)) {
      return items;
    }
    return [...orphans, ...items];
  }, [items, orphans, loading]);

  const resolvedRenderItem = useMemo<(value: TValue) => React.ReactNode>(
    () =>
      renderItem ??
      ((val: TValue) => findSelectItem(effectiveItems, val)?.text ?? val),
    [renderItem, effectiveItems],
  );

  const renderSelectedContent = (): React.ReactNode => {
    if (multiple) {
      if (renderSelectedItem) {
        return (renderSelectedItem as (values: TValue[]) => React.ReactNode)(
          selectedValues,
        );
      }
      return selectedValues.map((val, index) => (
        <Fragment key={val}>
          {index > 0 && ", "}
          {resolvedRenderItem(val)}
        </Fragment>
      ));
    }
    const selectedValue = selectedValues[0];
    if (selectedValue === undefined) {
      return "";
    }
    const renderSingle =
      (renderSelectedItem as
        | ((value: TValue) => React.ReactNode)
        | undefined) ?? resolvedRenderItem;
    return renderSingle(selectedValue);
  };

  const isOptional = required !== true && !multiple;
  const atMaxItems =
    !!multiple && maxItems !== undefined && selectedValues.length >= maxItems;
  // At maxItems only the currently-selected values stay enabled, so they can be deselected
  const selectableAtMax = atMaxItems ? selectedValues : undefined;
  const selectOnly = useCallback(
    (val: TValue) => {
      (onChange as (value: TValue[]) => void)([val]);
    },
    [onChange],
  );
  const menuItems = useMemo(() => {
    const mapped = mapToMenuItems(effectiveItems, resolvedRenderItem, {
      multiple: !!multiple,
      selectableValues:
        selectableAtMax === undefined ? undefined : new Set(selectableAtMax),
      selectOnly,
    });
    if (!isOptional || mapped.length === 0) {
      return mapped;
    }
    const noneItem: Item = {
      id: noneValue,
      text: "\u200B",
      subItems: undefined,
      onClick: () => {},
    };
    return [noneItem, ...mapped];
  }, [
    effectiveItems,
    isOptional,
    resolvedRenderItem,
    noneValue,
    multiple,
    selectableAtMax,
    selectOnly,
  ]);
  const collection = useMemo(() => {
    const valueToText = new Map<string, string>();
    for (const entry of effectiveItems) {
      if ("items" in entry) {
        for (const it of entry.items) {
          valueToText.set(it.value, it.text);
        }
      } else {
        valueToText.set(entry.value, entry.text);
      }
    }
    return createListCollection<Item>({
      items: flattenItems(menuItems),
      itemToValue: (item) => getItemId(item),
      itemToString: (item) => {
        const id = getItemId(item);
        if (id === noneValue) {
          return "";
        }
        return valueToText.get(id) ?? id;
      },
      isItemDisabled: (item) => !!item.disabled,
    });
  }, [menuItems, effectiveItems, noneValue]);

  const classes = selectRecipe({
    variant,
    size,
    align,
    width,
    multiple: !!multiple,
    invalid: !!invalid,
    disabled: !!disabled,
    loading: !!loading,
    hideArrow: !!hideArrow,
    hasPrefix: !!prefix,
    connectsLeft,
    connectsRight,
    customRender: !!renderItem || !!renderSelectedItem,
    clampTriggerHeight:
      (!!renderItem || !!renderSelectedItem) && (connectsLeft || connectsRight),
    willClear: showClear && clearable.clearable && !hasSelection,
  });

  if (readonly) {
    return (
      <span
        ref={ref}
        className={cx(classes.readonly, className)}
        data-testid={testId}
        {...ariaProps}
      >
        {renderSelectedContent()}
      </span>
    );
  }

  return (
    <ArkSelect.Root
      collection={collection}
      value={selectedValues}
      multiple={multiple}
      closeOnSelect={!multiple}
      onValueChange={({ value: nextValue }) => {
        if (multiple) {
          const next = nextValue as TValue[];
          if (maxItems !== undefined && next.length > maxItems) {
            return;
          }
          (onChange as (value: TValue[]) => void)(next);
          return;
        }
        const next = nextValue[0];
        if (next === noneValue) {
          (onChange as (value: null) => void)(null);
          return;
        }
        if (next !== undefined) {
          (onChange as (value: TValue) => void)(next as TValue);
        }
      }}
      disabled={disabled}
      invalid={invalid}
      required={required}
      name={name}
      loopFocus={false}
      lazyMount
      unmountOnExit
      positioning={{
        getAnchorRect: () => selectRef.current?.getBoundingClientRect() ?? null,
      }}
      ref={ref as React.Ref<HTMLDivElement>}
      className={cx(classes.wrapper, className)}
    >
      <ArkSelect.HiddenSelect ref={inputRef} />
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-to-focus container delegates to inner <input> */}
      <div
        ref={selectRef}
        className={classes.select}
        onClick={(event) => {
          if (
            internalRef.current &&
            !internalRef.current.contains(event.target as Node)
          ) {
            internalRef.current.click();
          }
        }}
      >
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
            {...resolveAutoFocusProps(autoFocus)}
            ref={internalRef as React.Ref<HTMLButtonElement>}
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
            {hasSelection ? (
              <>
                {(renderItem || renderSelectedItem) && "\u200B"}
                {renderSelectedContent()}
              </>
            ) : (
              (placeholder ?? "\u200B")
            )}
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
                (!clearable.clearable || !hasSelection) && classes.hideClear,
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
            className={classes.list}
            items={menuItems}
            selected={selectedValues}
            size={size}
            emptyState={
              emptyState ??
              (loading ? "Loading options…" : "No options available")
            }
          />
        </ArkSelect.Positioner>
      </Portal>
    </ArkSelect.Root>
  );
};
