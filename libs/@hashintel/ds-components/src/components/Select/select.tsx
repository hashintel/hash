import { createListCollection } from "@ark-ui/react/collection";
import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect, useSelectContext } from "@ark-ui/react/select";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { resolveAutoFocusProps } from "../../util/form-shared";
import { OverflowRow } from "../../util/OverflowRow/overflow-row";
import { usePortalContainerRef } from "../../util/portal-container-context";
import {
  SelectableList,
  isCustomItem,
  type Item,
  type ItemOrGroup,
} from "../../util/SelectableList/selectable-list";
import { SelectableListSearch } from "../../util/SelectableList/selectable-list-search";
import { searchEmpty } from "../../util/SelectableList/selectable-list-search.recipe";
import { SelectableListSelectionSummary } from "../../util/SelectableList/selectable-list-selection-summary";
import { getItemId } from "../../util/SelectableList/selectable-list-util";
import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
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
  /** subtle inputs have no border and display similarly to inline text; naked inputs strip all input chrome — no border, padding, hover or focus styles — and inherit the surrounding text styles regardless of `size` (which still sizes the dropdown list). The host is responsible for any focus affordance around a naked select. */
  variant?: "default" | "subtle" | "naked";
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
  /** Set to allow the input to be cleared. `true` clears by calling `onChange` with `null` (or `[]` for a multi select); pass `{ onClear }` to control clearing yourself. `false` disables clearing while still reserving the clear button's space. */
  clearable?: boolean | { onClear: () => void };
  onClick?: React.MouseEventHandler<Element>;
  onKeyDown?: React.KeyboardEventHandler<Element>;
  tabIndex?: number;
  /** Custom renderer for items in the dropdown. Defaults to the item's `text`. Note that if connectToLeftInput or connectToRightInput the height of the rendered selected item is clamped to the default height of select so that it correctly aligns. */
  renderItem?: (value: TValue) => React.ReactNode;
  /** The input ref - this is different to the ref, which is the containing element. This refers instead to a hidden select element (the actual ui uses a button to handle custom styling). Use this to access the internal select state and/or to set focus. */
  inputRef?: React.Ref<HTMLSelectElement>;
  /** Optional custom message for scenarios where there are no items available to show */
  emptyState?: React.ReactNode;
  /** Called when the dropdown opens or closes */
  onOpenChange?: (open: boolean) => void;
  /** Mount with the dropdown already open. Read once on mount; it does not open or close the dropdown afterwards, and `onOpenChange` does not fire for this initial state. */
  defaultOpen?: boolean;
} & Omit<
  SharedInputProps<HTMLButtonElement, string | null | undefined>,
  "value" | "onChange" | "required" | "inputRef"
> &
  React.AriaAttributes;

/** Adds a search field to the dropdown that filters the items by their text.
 * onSearch is called as the search value changes, including with "" when the
 * dropdown closes and the search resets. */
type SelectSearchable = {
  onSearch?: (search: string) => void;
};

type SelectSingleProps<TValue extends string> = {
  /** Set to allow selecting multiple values */
  multiple?: false;
  maxItems?: never;
  overflow?: never;
  /** Set to add a search field to the dropdown that filters the items by their text. onSearch is called as the search value changes, including with "" when the dropdown closes and the search resets. */
  searchable?:
    | boolean
    | (SelectSearchable & {
        hideCount?: never;
        hideSelectAllToggle?: never;
      });
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
  /** Set to allow selecting multiple values. The dropdown stays open while selecting, and items indicate selection with a checkbox unless they set their own `variant`. Closing the dropdown with Escape reverts the selection to what it was when the dropdown opened (`onChange` fires with the reverted values). */
  multiple: true;
  /** The maximum number of values that can be selected. Once reached, unselected items are disabled until a value is deselected. */
  maxItems?: number;
  /** How the selected values render in the trigger when no `renderSelectedItem` is given: a row that scrolls horizontally (the default), truncates with a "+X" badge, or summarises the names (falling back to "X of Y" once they no longer fit). */
  overflow?: "scroll" | "truncate" | "summary";
  /** Set to add a search field to the dropdown that filters the items by their text. onSearch is called as the search value changes, including with "" when the dropdown closes and the search resets. A searchable multi select also renders a selection summary (an "x of y" selected count and a "Select all" / "Clear all" toggle, both spanning every option regardless of the active search filter) beneath the options — hide its parts with `hideCount` / `hideSelectAllToggle`. */
  searchable?:
    | boolean
    | (SelectSearchable & {
        /** Hide the "x of y" selected count in the selection summary. It is
         * also hidden while `loading`, when the option count is not yet
         * known. */
        hideCount?: boolean;
        /** Hide the "Select all" / "Clear all" toggle in the selection
         * summary. It is also hidden when `maxItems` puts selecting every
         * option out of reach. */
        hideSelectAllToggle?: boolean;
      });
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

/**
 * While a search filter is active, keeps the highlight on the first visible
 * item, so arrows/Enter from the search field always operate on the filtered
 * results — the previous highlight may have been filtered out of the
 * collection, which would strand zag's arrow navigation.
 */
const SearchHighlightSync = ({
  search,
  firstVisibleValue,
}: {
  search: string;
  firstVisibleValue: string | undefined;
}) => {
  const select = useSelectContext();
  // Re-sync when the search OR the first match changes (results can arrive
  // after the query, e.g. loading or onSearch-driven fetches), but not on
  // plain re-renders — arrow-key navigation must keep its highlight.
  const lastSynced = useRef<{
    search: string;
    firstVisibleValue: string | undefined;
  }>({ search: "", firstVisibleValue: undefined });

  useEffect(() => {
    const last = lastSynced.current;
    if (
      last.search === search &&
      last.firstVisibleValue === firstVisibleValue
    ) {
      return;
    }
    lastSynced.current = { search, firstVisibleValue };
    if (search === "") {
      return;
    }
    if (firstVisibleValue !== undefined) {
      select.setHighlightValue(firstVisibleValue);
    } else {
      select.clearHighlightValue();
    }
  }, [search, firstVisibleValue, select]);

  return null;
};

/** Flattens groups and drops custom rows (e.g. the empty-search note), which must not enter the collection as selectable options */
function flattenItems(items: Array<ItemOrGroup<Item>>): Item[] {
  const flat: Item[] = [];
  for (const entry of items) {
    if ("items" in entry) {
      flat.push(...entry.items);
    } else if (!isCustomItem(entry)) {
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
  overflow,
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
  onOpenChange,
  defaultOpen,
  searchable,
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

  const showClear = clearable !== undefined && !disabled;
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

  // A multi select's Escape reverts the selection to its state at dropdown
  // open (per-toggle onChange commits are treated as a cancellable session).
  // Ark dismisses on Escape from a native document-capture listener — before
  // any React handler — so the only spot that reliably precedes the close is
  // a window-capture listener; the close handler then consumes the flag.
  // A `defaultOpen` mount starts mid-"session": ark fires no onOpenChange
  // for the initial state, so the refs seed as if it had just opened.
  const isOpenRef = useRef(!!defaultOpen);
  const escapedRef = useRef(false);
  const valueAtOpenRef = useRef<TValue[]>(defaultOpen ? selectedValues : []);
  useEffect(() => {
    if (!multiple) {
      return;
    }
    const markEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpenRef.current) {
        escapedRef.current = true;
      }
    };
    window.addEventListener("keydown", markEscape, true);
    return () => {
      window.removeEventListener("keydown", markEscape, true);
    };
  }, [multiple]);

  const [search, setSearch] = useState("");
  const showSearch = !!searchable;
  const onSearch =
    typeof searchable === "object" ? searchable.onSearch : undefined;
  const handleSearchChange = useCallback(
    (next: string) => {
      setSearch(next);
      onSearch?.(next);
    },
    [onSearch],
  );
  const searchTerms = useMemo(
    () => (showSearch ? search.toLowerCase().split(/\s+/).filter(Boolean) : []),
    [showSearch, search],
  );
  const visibleItems = useMemo<
    ReadonlyArray<ItemOrGroup<MultiSelectItem<TValue>>>
  >(() => {
    if (searchTerms.length === 0) {
      return effectiveItems;
    }
    const matches = (it: MultiSelectItem<TValue>) => {
      const label = it.text.toLowerCase();
      return searchTerms.every((term) => label.includes(term));
    };
    const filtered: Array<ItemOrGroup<MultiSelectItem<TValue>>> = [];
    for (const entry of effectiveItems) {
      if ("items" in entry) {
        const children = entry.items.filter(matches);
        if (children.length > 0) {
          filtered.push({ ...entry, items: children });
        }
      } else if (matches(entry)) {
        filtered.push(entry);
      }
    }
    return filtered;
  }, [effectiveItems, searchTerms]);

  const resolvedRenderItem = useMemo<(value: TValue) => React.ReactNode>(
    () =>
      renderItem ??
      ((val: TValue) => findSelectItem(effectiveItems, val)?.text ?? val),
    [renderItem, effectiveItems],
  );

  // Every option's value, disabled options included — the total behind the
  // selection summary and the `summary` overflow row, and the value set that
  // "Select all" selects.
  const optionValues = useMemo<TValue[]>(() => {
    const values: TValue[] = [];
    for (const entry of effectiveItems) {
      if ("items" in entry) {
        for (const it of entry.items) {
          values.push(it.value);
        }
      } else {
        values.push(entry.value);
      }
    }
    return values;
  }, [effectiveItems]);

  // Multi selects without a custom renderSelectedItem render their selected
  // values through an OverflowRow, scrolling by default.
  const overflowMode =
    multiple && !renderSelectedItem ? (overflow ?? "scroll") : undefined;

  const renderSelectedContent = (): React.ReactNode => {
    if (multiple) {
      if (renderSelectedItem) {
        return (renderSelectedItem as (values: TValue[]) => React.ReactNode)(
          selectedValues,
        );
      }
      const mode = overflow ?? "scroll";
      const rowItems = selectedValues.map((val) => ({
        name: findSelectItem(effectiveItems, val)?.text ?? val,
        children: resolvedRenderItem(val),
      }));
      return mode === "summary" ? (
        <OverflowRow
          items={rowItems}
          separator=", "
          overflow="summary"
          total={optionValues.length}
        />
      ) : (
        <OverflowRow items={rowItems} separator=", " overflow={mode} />
      );
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
  const selectableAtMaxSet = useMemo<ReadonlySet<string> | undefined>(
    () =>
      selectableAtMax === undefined
        ? undefined
        : new Set<string>(selectableAtMax),
    [selectableAtMax],
  );

  // The first search match the highlight can land on — must apply the same
  // effective-disabled rule as the collection (explicit `disabled` plus rows
  // disabled by `maxItems`), or Enter would target an unselectable row
  const firstVisibleValue = useMemo<TValue | undefined>(() => {
    const isEnabled = (it: MultiSelectItem<TValue>) =>
      !it.disabled &&
      (selectableAtMaxSet === undefined || selectableAtMaxSet.has(it.value));
    for (const entry of visibleItems) {
      if ("items" in entry) {
        const first = entry.items.find(isEnabled);
        if (first) {
          return first.value;
        }
      } else if (isEnabled(entry)) {
        return entry.value;
      }
    }
    return undefined;
  }, [visibleItems, selectableAtMaxSet]);

  const selectOnly = useCallback(
    (val: TValue) => {
      (onChange as (value: TValue[]) => void)([val]);
    },
    [onChange],
  );

  // The selection summary of a searchable multi select. Its counts and its
  // "Select all" span the whole option set — disabled options included, so
  // "Select all" always reaches "X of X" — not the current search filter.
  const selectAll = useCallback(() => {
    (onChange as (value: TValue[]) => void)([
      ...new Set([...selectedValues, ...optionValues]),
    ]);
  }, [onChange, selectedValues, optionValues]);
  const clearAll = useCallback(() => {
    (onChange as (value: TValue[]) => void)([]);
  }, [onChange]);
  // Backs the clear button: a custom onClear when given, otherwise clears
  // the selection directly through onChange.
  const clearSelection = () => {
    if (typeof clearable === "object") {
      clearable.onClear();
    } else if (multiple) {
      (onChange as (value: TValue[]) => void)([]);
    } else {
      (onChange as (value: null) => void)(null);
    }
  };
  // Hide the count while options are still loading (the total is not yet
  // known), and the toggle when maxItems makes selecting all impossible.
  const searchableOptions =
    typeof searchable === "object" ? searchable : undefined;
  const hideSummaryCount = !!searchableOptions?.hideCount || !!loading;
  const hideSummaryToggle =
    !!searchableOptions?.hideSelectAllToggle ||
    (maxItems !== undefined && maxItems < optionValues.length);
  // Omitted entirely (rather than rendering an empty component) when both
  // parts are hidden, so no empty footer band appears around it.
  const selectionSummary =
    showSearch && multiple && !(hideSummaryCount && hideSummaryToggle) ? (
      <SelectableListSelectionSummary
        hideCount={hideSummaryCount}
        hideSelectAllToggle={hideSummaryToggle}
        selectedCount={selectedValues.length}
        totalCount={optionValues.length}
        onSelectAll={selectAll}
        onClearAll={clearAll}
      />
    ) : undefined;
  const resolvedEmptyState =
    emptyState ?? (loading ? "Loading options\u2026" : "No options available");
  const menuItems = useMemo(() => {
    const mapped: Array<ItemOrGroup<Item>> = mapToMenuItems(
      visibleItems,
      resolvedRenderItem,
      {
        multiple: !!multiple,
        selectableValues: selectableAtMaxSet,
        selectOnly,
      },
    );
    const searching = searchTerms.length > 0;
    if (isOptional && !searching && mapped.length > 0) {
      const noneItem: Item = {
        id: noneValue,
        text: "\u200B",
        subItems: undefined,
        onClick: () => {},
      };
      mapped.unshift(noneItem);
    }
    if (showSearch && mapped.length === 0) {
      return [
        {
          id: `${noneValue}-search-empty`,
          custom: (
            <span className={searchEmpty()}>
              {searching ? "No matching options" : resolvedEmptyState}
            </span>
          ),
        },
      ];
    }
    return mapped;
  }, [
    visibleItems,
    isOptional,
    resolvedRenderItem,
    noneValue,
    multiple,
    selectableAtMaxSet,
    selectOnly,
    showSearch,
    searchTerms,
    resolvedEmptyState,
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
    customRender:
      !!renderItem || !!renderSelectedItem || overflowMode !== undefined,
    overflowRow: overflowMode !== undefined,
    clampTriggerHeight:
      (!!renderItem || !!renderSelectedItem || overflowMode !== undefined) &&
      (connectsLeft || connectsRight),
    willClear: showClear && !!clearable && !hasSelection,
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
      defaultOpen={defaultOpen}
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
      onOpenChange={({ open }) => {
        isOpenRef.current = open;
        if (open) {
          escapedRef.current = false;
          valueAtOpenRef.current = selectedValues;
        } else {
          if (multiple && escapedRef.current) {
            escapedRef.current = false;
            const atOpen = valueAtOpenRef.current;
            const unchanged =
              atOpen.length === selectedValues.length &&
              atOpen.every((entry, index) => entry === selectedValues[index]);
            if (!unchanged) {
              (onChange as (value: TValue[]) => void)([...atOpen]);
            }
          }
          if (search !== "") {
            handleSearchChange("");
          }
        }
        onOpenChange?.(open);
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
      {showSearch && (
        <SearchHighlightSync
          search={search}
          firstVisibleValue={firstVisibleValue}
        />
      )}
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
                {(renderItem ||
                  renderSelectedItem ||
                  overflowMode !== undefined) &&
                  "\u200B"}
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
                clearSelection();
                internalRef.current?.focus();
              }}
              className={cx(
                classes.clear,
                (!clearable || !hasSelection) && classes.hideClear,
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
            emptyState={resolvedEmptyState}
            header={
              showSearch ? (
                <SelectableListSearch
                  value={search}
                  onChange={handleSearchChange}
                  aria-label="Search options"
                />
              ) : undefined
            }
            footer={selectionSummary}
            swapHeaderFooterOnFlip
          />
        </ArkSelect.Positioner>
      </Portal>
    </ArkSelect.Root>
  );
};
