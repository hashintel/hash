import { createListCollection } from "@ark-ui/react/collection";
import { Combobox as ArkCombobox, useCombobox } from "@ark-ui/react/combobox";
import { Portal } from "@ark-ui/react/portal";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMergeRefs } from "use-callback-ref";

import { cx } from "@hashintel/ds-helpers/css";

import { resolveAutoFocusProps } from "../../util/form-shared";
import { OverflowRow } from "../../util/OverflowRow/overflow-row";
import { parkedPopperPositioner } from "../../util/popper-positioner";
import { usePortalContainerRef } from "../../util/portal-container-context";
import { renderAdornment } from "../../util/render-adornment";
import { hasMultiItemSuffix } from "../../util/SelectableList/has-multi-item-suffix";
import {
  type Item,
  type ItemOrGroup,
  SelectableList,
} from "../../util/SelectableList/selectable-list";
import { MultiItemSuffix } from "../../util/SelectableList/selectable-list-multi-suffix";
import {
  getItemId,
  isCustomItem,
} from "../../util/SelectableList/selectable-list-util";
import { Chip } from "../Chip/chip";
import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { BaseInput } from "../TextInput/base-input";
import { baseInputRecipe } from "../TextInput/base-input.recipe";
import { InputConnector } from "../TextInput/input-connector";
import {
  comboboxChipContentRecipe,
  comboboxMultiRecipe,
  comboboxNewValueOptionRecipe,
  comboboxDropdownRecipe,
} from "./combobox.recipe";

import type { FormInputSize } from "../../util/form-shared";
import type { ChipSize } from "../Chip/chip-util";
import type { TextInput } from "../TextInput/text-input";

export type ComboboxItem<TValue extends string = string> = {
  value: TValue;
  /** Visible label, also the text matched by filtering */
  text: string;
  disabled?: boolean;
} & Pick<Item, "selectedStyle">;

export type MultiComboboxItem<TValue extends string = string> =
  ComboboxItem<TValue> & {
    /** Optional content aligned to the right of the item in the dropdown */
    suffix?: React.ReactNode;
    /** Show an "Only" button while the item is hovered, which sets the selection to just this item. It renders in the suffix position, replacing `suffix` while visible. */
    showOnlyButton?: boolean;
    // selectedTone: the selected indicator's tone (checkbox fill, tick or
    // highlight color), defaulting to `neutral`. Named after the list `Item`
    // field it maps onto, matching MultiSelectItem.
  } & Pick<Item, "selectedTone">;

type AllowNewValueOptions = {
  /** If left undefined shows the option when the input does not match an enabled option */
  alwaysShowOption?: boolean;
  /** Customize how the option looks */
  renderOption?: (input: string) => React.ReactNode;
};

type ComboboxBaseProps = Omit<
  React.ComponentProps<typeof TextInput>,
  "autocomplete" | "onChange" | "value" | "style"
> & {
  /** Called as the input's text changes, whether typed or set by a selection */
  onChangeInput?: (value: string) => void;
  /** How options are filtered against the typed text. Defaults to `contains`. */
  filterAlgorithm?:
    | "contains"
    | "startsWith"
    | "none"
    | ((input: string, text: string, value: string) => boolean);
  /** Rendered in the dropdown when the typed text matches no option, replacing the default "No matching options". With no options to filter at all, the dropdown shows `emptyState` instead. */
  noMatchMessage?: (input: string) => React.ReactNode;
  /** Rendered in the dropdown when there are no options at all, replacing the default "No options available" */
  emptyState?: React.ReactNode;
};

type ComboboxSingleProps<TValue extends string> = {
  /** Set to allow selecting multiple values */
  multiple?: false;
  maxItems?: never;
  overflow?: never;
  clearInputOnSelect?: never;
  renderSelectedAll?: never;
  items?: ReadonlyArray<ItemOrGroup<ComboboxItem<TValue>>>;
  /** Custom renderer for options in the dropdown. Defaults to the option's `text`. */
  renderItem?: (value: TValue) => React.ReactNode;
  /** Custom renderer for the committed value, shown while the input is unfocused */
  renderSelectedItem?: (value: TValue) => React.ReactNode;
} & (
  | {
      /** Allow committing typed text that matches no option, offered as an extra dropdown option */
      allowNewValue: true | AllowNewValueOptions;
      required?: boolean;
      value: string | null | undefined;
      /**
       * Called when a value is committed. `isNew` is true when the committed value is typed
       * text that resolves to no option.
       */
      onChange: (value: string, isNew: boolean) => void;
    }
  | {
      allowNewValue?: false;
      required: true;
      value: NoInfer<TValue>;
      /** Called when a value is committed */
      onChange: (value: NoInfer<TValue>) => void;
    }
  | {
      allowNewValue?: false;
      required?: false;
      value: NoInfer<TValue> | null | undefined;
      /** Called when a value is committed — with `null` when the value is cleared. `value` stays wider (`undefined` allowed in) for consumers holding optional data. */
      onChange: (value: NoInfer<TValue> | null) => void;
    }
);

type ComboboxMultipleProps<TValue extends string> = {
  /** Set to allow selecting multiple values. */
  multiple: true;
  /** The maximum number of values that can be selected. Once reached, unselected items are disabled until a value is deselected. */
  maxItems?: number;
  /** Whether a selection change made from the dropdown — toggling an option, or an item's "Only" button — clears the typed text. */
  clearInputOnSelect?: boolean;
  /** How the selected values render in the input when no `renderSelectedAll` is given: a chip row that scrolls horizontally (the default), a chip row that truncates with a "+X" badge, or a plain-text summary of the names (falling back to "X of Y" once they no longer fit). */
  overflow?: "scroll" | "truncate" | "summary";
  items?: ReadonlyArray<ItemOrGroup<MultiComboboxItem<TValue>>>;
  /** Custom renderer for options in the dropdown; also each selected value's chip content, unless `renderSelectedItem` overrides that. Defaults to the option's `text`. */
  renderItem?: (value: TValue) => React.ReactNode;
  /** Custom renderer for a selected value's chip content in the input, per value. Defaults to `renderItem`, then the option's `text`. */
  renderSelectedItem?: (value: TValue) => React.ReactNode;
  /** Custom renderer for the selected values in the input, replacing the default overflow row */
  renderSelectedAll?: (values: TValue[]) => React.ReactNode;
  required?: boolean;
} & (
  | {
      /** Allow committing typed text that matches no option, offered as an extra dropdown option. Committed new values list as selected leading options in the dropdown, so they can be deselected like any other value. */
      allowNewValue: true | AllowNewValueOptions;
      value: ReadonlyArray<string>;
      /** Called with the next selection. `isNew` is true when the change added typed text that resolves to no option. */
      onChange: (value: string[], isNew: boolean) => void;
    }
  | {
      allowNewValue?: false;
      value: ReadonlyArray<NoInfer<TValue>>;
      /** Called with the next selection */
      onChange: (value: Array<NoInfer<TValue>>) => void;
    }
);

export type ComboboxProps<TValue extends string = string> = ComboboxBaseProps &
  (ComboboxSingleProps<TValue> | ComboboxMultipleProps<TValue>);

const findComboboxItem = <TItem extends ComboboxItem>(
  items: ReadonlyArray<ItemOrGroup<TItem>>,
  matches: (option: TItem) => boolean,
): TItem | undefined => {
  for (const entry of items) {
    if ("items" in entry) {
      const found = entry.items.find(matches);
      if (found) {
        return found;
      }
    } else if (matches(entry)) {
      return entry;
    }
  }
  return undefined;
};

const findComboboxItemByValue = <TItem extends ComboboxItem>(
  items: ReadonlyArray<ItemOrGroup<TItem>>,
  value: string,
): TItem | undefined =>
  value === ""
    ? undefined
    : findComboboxItem(items, (option) => option.value === value);

/**
 * Typed text names an option when it equals an enabled option's value, or an
 * enabled option's text case-insensitively. Disabled options never match:
 * they cannot be committed by typing.
 */
const findComboboxItemByTypedText = <TItem extends ComboboxItem>(
  items: ReadonlyArray<ItemOrGroup<TItem>>,
  text: string,
): TItem | undefined => {
  if (text === "") {
    return undefined;
  }
  const query = text.toLowerCase();
  return findComboboxItem(
    items,
    (option) =>
      !option.disabled &&
      (option.value === text || option.text.toLowerCase() === query),
  );
};

/**
 * Typed text that names no committable option yet equals some option's value
 * (necessarily a disabled option's) commits nothing: the option itself is not
 * committable, and a new value would collide with the option's value.
 */
const isBlockedTypedText = (
  items: ReadonlyArray<ItemOrGroup<ComboboxItem>>,
  text: string,
): boolean =>
  findComboboxItemByTypedText(items, text) === undefined &&
  findComboboxItemByValue(items, text) !== undefined;

const newValueOptionIconSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xxs",
  xs: "xs",
  sm: "xs",
  md: "sm",
  lg: "sm",
};

const chipSizeMap: Record<FormInputSize, ChipSize> = {
  xxs: "xxs",
  xs: "xs",
  sm: "md",
  md: "lg",
  lg: "xl",
};

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

/**
 * A copy of a keydown event whose `currentTarget` masks the two attributes
 * (`role`, `aria-expanded`) the tags machine's keydown gate reads before
 * ceding ArrowLeft/Right to an expanded combobox host — through both read
 * paths each has (the IDL reflection property and `getAttribute`), so a zag
 * upgrade switching between them cannot un-mask the gate. Everything else
 * delegates to the real input, and `preventDefault`/`stopPropagation` land
 * on the real event, so the machine's caret handling still works.
 */
const maskComboboxRoleFromTagsMachine = (
  event: React.KeyboardEvent<HTMLInputElement>,
): React.KeyboardEvent<HTMLInputElement> => {
  const input = event.currentTarget;
  const maskedAttributes = new Set(["role", "aria-expanded"]);
  const maskedInput = new Proxy(input, {
    get(element, property) {
      if (property === "role" || property === "ariaExpanded") {
        return null;
      }
      if (property === "getAttribute") {
        return (name: string) =>
          maskedAttributes.has(name) ? null : element.getAttribute(name);
      }
      const value = Reflect.get(element, property) as unknown;
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(element)
        : value;
    },
  });
  return {
    ...event,
    currentTarget: maskedInput,
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
  } as React.KeyboardEvent<HTMLInputElement>;
};

const flattenListItems = (items: Array<ItemOrGroup<Item>>): Item[] => {
  const flat: Item[] = [];
  for (const entry of items) {
    if ("items" in entry) {
      flat.push(...entry.items);
    } else if (!isCustomItem(entry)) {
      flat.push(entry);
    }
  }
  return flat;
};

/**
 * A text input with a dropdown of autocomplete options. The committed
 * `value` is an option's `value` (or, with `allowNewValue`, any typed
 * text); the text being typed is internal state reported via
 * `onChangeInput`. Abandoning uncommitted text (Escape, or closing the
 * dropdown without a selection) reverts the input to the committed value;
 * with `allowNewValue`, typed text commits through Enter or its dropdown
 * option, never by closing.
 *
 * With `multiple`, `value` is instead the array of selected values, rendered
 * as a row of chips inside the input, and the typed text is a transient
 * filter/draft: committing it or toggling an option clears it (see
 * `clearInputOnSelect`), and closing the dropdown discards it — with
 * `allowNewValue`, typed text only becomes a value through an explicit
 * selection of its dropdown option.
 */
export const Combobox = <TValue extends string>({
  items: itemsProp = [],
  multiple,
  maxItems,
  overflow,
  clearInputOnSelect = true,
  renderItem,
  renderSelectedItem,
  renderSelectedAll,
  onChangeInput,
  filterAlgorithm = "contains",
  allowNewValue = false,
  noMatchMessage,
  emptyState,
  value,
  onChange,
  clearable,
  styledValue,
  readonly,
  htmlForId,
  placeholder,
  className,
  name,
  testId,
  loading,
  prefix,
  suffix,
  width = "fullWidth",
  onFocus,
  onBlur,
  onClick,
  onKeyDown,
  autoFocus,
  variant = "default",
  size = "md",
  disabled,
  required,
  invalid,
  ref,
  ...inputProps
}: ComboboxProps<TValue>) => {
  // Leftover TextInput props: the single variant hands them to BaseInput
  // wholesale below; the multi variant forwards the input-element ones onto
  // the row's input and wires the connectors onto its frame itself
  // (`align`/`showEditIcon` stay single-only).
  const {
    align: _align,
    showEditIcon: _showEditIcon,
    connectToLeftInput,
    connectToRightInput,
    spellcheck,
    inputRef,
    ...forwardedInputAttrs
  } = inputProps;
  const portalContainerRef = usePortalContainerRef();
  const wrapperRef = useRef<HTMLElement>(null);
  const mergedWrapperRef = useMergeRefs([wrapperRef, ...(ref ? [ref] : [])]);
  const fieldIdFromContext = useFieldId();
  const inputId = htmlForId ?? fieldIdFromContext ?? undefined;
  // Per-instance sentinel for the "use typed text" option — guaranteed not
  // to collide with any consumer-supplied option value.
  const newValueOptionId = useId();
  // A multi input always carries a concrete id: the combobox machine and the
  // row's tags machine both look the shared element up by it.
  const generatedInputId = useId();
  const multiInputId = inputId ?? `combobox-input${generatedInputId}`;

  const items = itemsProp as ReadonlyArray<ItemOrGroup<MultiComboboxItem>>;
  const renderOption = renderItem as
    | ((value: string) => React.ReactNode)
    | undefined;
  const renderSelectedOption = renderSelectedItem as
    | ((value: string) => React.ReactNode)
    | undefined;

  const newValueOptions = useMemo<AllowNewValueOptions | undefined>(
    () =>
      allowNewValue === false
        ? undefined
        : allowNewValue === true
          ? {}
          : allowNewValue,
    [allowNewValue],
  );

  const selectedValues = useMemo<string[]>(
    () => (multiple ? [...(value as ReadonlyArray<string>)] : []),
    [multiple, value],
  );
  const hasSelection = selectedValues.length > 0;

  const orphanItems = useMemo<MultiComboboxItem[]>(
    () =>
      multiple
        ? selectedValues
            .filter((val) => findComboboxItemByValue(items, val) === undefined)
            .map((val) => ({ value: val, text: val }))
        : [],
    [multiple, items, selectedValues],
  );
  const effectiveItems = useMemo<ReadonlyArray<ItemOrGroup<MultiComboboxItem>>>(
    () => (orphanItems.length === 0 ? items : [...orphanItems, ...items]),
    [items, orphanItems],
  );

  const committedValue = multiple
    ? ""
    : ((value as string | null | undefined) ?? "");
  const committedItem = useMemo(
    () => findComboboxItemByValue(effectiveItems, committedValue),
    [effectiveItems, committedValue],
  );
  const committedText = committedItem?.text ?? committedValue;

  const [inputText, setInputText] = useState(committedText);
  // Re-sync the input's text when the committed value changes externally
  const [lastCommittedText, setLastCommittedText] = useState(committedText);
  if (committedText !== lastCommittedText) {
    setLastCommittedText(committedText);
    setInputText(committedText);
  }

  // The machine's callbacks fire in synchronous bursts (a selection updates
  // the value, the input text and the open state in one event), so decisions
  // made in later callbacks need the values earlier ones just set — state
  // and props are stale until the next render. The setters below keep the
  // refs current within a burst; the effect re-syncs them after external
  // changes to the props/state they mirror.
  const inputTextRef = useRef(inputText);
  const committedTextRef = useRef(committedText);
  const selectedValuesRef = useRef(selectedValues);
  const valueAtOpenRef = useRef<string[]>([]);
  const highlightedValueRef = useRef<string | null>(null);
  const openRef = useRef(false);
  const backspaceHoldBeganWithTextRef = useRef(false);
  useEffect(() => {
    inputTextRef.current = inputText;
    committedTextRef.current = committedText;
    selectedValuesRef.current = selectedValues;
  });

  const [highlightNavigated, setHighlightNavigated] = useState(false);

  const setText = useCallback(
    (next: string) => {
      if (next === inputTextRef.current) {
        return;
      }
      inputTextRef.current = next;
      setInputText(next);
      onChangeInput?.(next);
    },
    [onChangeInput],
  );

  const emitSingleChange = (next: string, isNew: boolean) => {
    if (newValueOptions !== undefined) {
      (onChange as (value: string, isNew: boolean) => void)(next, isNew);
    } else {
      (onChange as (value: string | null) => void)(next === "" ? null : next);
    }
  };
  const emitMultiChange = useCallback(
    (next: string[], isNew: boolean) => {
      selectedValuesRef.current = next;
      (onChange as (value: string[], isNew: boolean) => void)(next, isNew);
    },
    [onChange],
  );

  const commit = (next: string, matchedItem: MultiComboboxItem | undefined) => {
    const nextValue = matchedItem?.value ?? next;
    committedTextRef.current = matchedItem?.text ?? next;
    if (nextValue !== committedValue) {
      emitSingleChange(
        nextValue,
        nextValue !== "" && matchedItem === undefined,
      );
    }
  };

  const addValue = (val: string, isNew: boolean) => {
    const current = selectedValuesRef.current;
    if (current.includes(val)) {
      return;
    }
    if (maxItems !== undefined && current.length >= maxItems) {
      return;
    }
    emitMultiChange([...current, val], isNew);
  };

  // Typed text commits the option it names — resolved exactly as the create
  // option's visibility decides it — so only genuinely unmatched text becomes
  // a new value. Blocked text commits nothing; the caller's revert handles it.
  // A multi commit only ever adds: resolving text selects the option it
  // names, unmatched text becomes a new value, and either way the draft has
  // served its purpose and clears.
  const commitTypedText = (text: string) => {
    if (isBlockedTypedText(effectiveItems, text)) {
      return;
    }
    const matched = findComboboxItemByTypedText(effectiveItems, text);
    if (!multiple) {
      commit(text, matched);
      return;
    }
    if (matched !== undefined) {
      addValue(matched.value, false);
    } else if (text !== "") {
      addValue(text, true);
    }
    setText("");
  };

  const revertInput = () => {
    setText(committedTextRef.current);
  };

  // No filter while the input still shows the committed value: the user has
  // not typed yet, so reopening the dropdown lists every option. (A multi
  // combobox commits no text, so its draft always filters.)
  const filterQuery = inputText === committedText ? "" : inputText;

  const hasAnyOption = effectiveItems.some((entry) =>
    "items" in entry ? entry.items.length > 0 : true,
  );

  const visibleOptions = useMemo<
    ReadonlyArray<ItemOrGroup<MultiComboboxItem>>
  >(() => {
    if (filterQuery === "" || filterAlgorithm === "none") {
      return effectiveItems;
    }
    const query = filterQuery.toLowerCase();
    const matches = (option: MultiComboboxItem): boolean => {
      if (typeof filterAlgorithm === "function") {
        return filterAlgorithm(filterQuery, option.text, option.value);
      }
      const text = option.text.toLowerCase();
      return filterAlgorithm === "startsWith"
        ? text.startsWith(query)
        : text.includes(query);
    };
    const filtered: Array<ItemOrGroup<MultiComboboxItem>> = [];
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
  }, [effectiveItems, filterQuery, filterAlgorithm]);

  const typedTextNamesOption = useMemo(
    () => findComboboxItemByTypedText(effectiveItems, inputText) !== undefined,
    [effectiveItems, inputText],
  );

  const atMaxItems =
    !!multiple && maxItems !== undefined && selectedValues.length >= maxItems;

  const selectableAtMaxSet = useMemo<ReadonlySet<string> | undefined>(
    () => (atMaxItems ? new Set(selectedValues) : undefined),
    [atMaxItems, selectedValues],
  );

  const showNewValueOption =
    newValueOptions !== undefined &&
    inputText !== "" &&
    !atMaxItems &&
    !isBlockedTypedText(effectiveItems, inputText) &&
    (newValueOptions.alwaysShowOption ?? !typedTextNamesOption);

  // An "Only" press is a selection change made from the dropdown, so it
  // honors clearInputOnSelect like a toggle — its click never reaches the
  // option (stopPropagation), bypassing onValueChange's own clearing.
  const selectOnly = useCallback(
    (val: string) => {
      emitMultiChange([val], false);
      if (clearInputOnSelect) {
        setText("");
      }
    },
    [emitMultiChange, clearInputOnSelect, setText],
  );

  const listItems = useMemo<Array<ItemOrGroup<Item>>>(() => {
    const toItem = (option: MultiComboboxItem): Item => ({
      id: option.value,
      text: renderOption ? renderOption(option.value) : option.text,
      disabled:
        option.disabled ||
        (selectableAtMaxSet !== undefined &&
          !selectableAtMaxSet.has(option.value)),
      selectedStyle:
        option.selectedStyle ?? (multiple ? "checkbox" : "highlight"),
      selectedTone: option.selectedTone,
      suffix:
        multiple && hasMultiItemSuffix(option) ? (
          <MultiItemSuffix
            suffix={option.suffix}
            showOnlyButton={option.showOnlyButton}
            disabled={option.disabled}
            tone={option.selectedTone}
            onSelectOnly={() => selectOnly(option.value)}
          />
        ) : undefined,
      subItems: undefined,
      onClick: () => {},
    });
    const mapped: Array<ItemOrGroup<Item>> = visibleOptions.map((entry) =>
      "items" in entry
        ? { id: entry.id, label: entry.label, items: entry.items.map(toItem) }
        : toItem(entry),
    );
    if (showNewValueOption) {
      mapped.push({
        id: newValueOptionId,
        text: newValueOptions.renderOption?.(inputText) ?? (
          <span className={comboboxNewValueOptionRecipe()}>
            <Icon name="plus" size={newValueOptionIconSizeMap[size]} />
            {inputText}
          </span>
        ),
        selectedStyle: "highlight",
        subItems: undefined,
        onClick: () => {},
      });
    }
    return mapped;
  }, [
    visibleOptions,
    renderOption,
    multiple,
    selectableAtMaxSet,
    selectOnly,
    showNewValueOption,
    newValueOptions,
    inputText,
    newValueOptionId,
    size,
  ]);

  const collection = useMemo(() => {
    const valueToText = new Map<string, string>();
    const collect = (option: MultiComboboxItem) => {
      valueToText.set(option.value, option.text);
    };
    for (const entry of effectiveItems) {
      if ("items" in entry) {
        for (const option of entry.items) {
          collect(option);
        }
      } else {
        collect(entry);
      }
    }
    return createListCollection<Item>({
      items: flattenListItems(listItems),
      itemToValue: (item) => getItemId(item),
      // What selecting the item puts into the input
      itemToString: (item) => {
        const id = getItemId(item);
        if (id === newValueOptionId) {
          return inputText;
        }
        return valueToText.get(id) ?? id;
      },
      isItemDisabled: (item) => !!item.disabled,
    });
  }, [listItems, effectiveItems, inputText, newValueOptionId]);

  // A single machine only receives values that resolve to an option: on a
  // value change it re-derives the input text from the collection, which
  // would "stringify" a committed new value (never in the collection) to an
  // empty input. Single new values live entirely in this wrapper; a multi
  // machine skips that re-derivation, and its committed new values resolve
  // anyway via the synthetic options above.
  const machineValue = useMemo(() => {
    if (multiple) {
      return selectedValues;
    }
    return committedItem === undefined ? [] : [committedValue];
  }, [multiple, selectedValues, committedItem, committedValue]);

  const combobox = useCombobox({
    collection,
    ids: multiple
      ? { input: multiInputId }
      : inputId === undefined
        ? undefined
        : { input: inputId },
    inputValue: inputText,
    value: machineValue,
    multiple,
    closeOnSelect: !multiple,
    ...(multiple
      ? {
          selectionBehavior: "preserve" as const,
          inputBehavior: "autohighlight" as const,
        }
      : {}),
    disabled,
    invalid,
    // In multi mode the machine's input is the chip-row filter: a native
    // `required` there would track the typed draft, not the selection. The
    // hidden mirror select below carries form participation instead.
    required: multiple ? undefined : required,
    openOnClick: true,
    // The machine (whose prop keeps ark's allowCustomValue name) must never
    // revert/reject typed text itself — commit and revert are decided below
    // (in onOpenChange) so committed new values, which the collection cannot
    // stringify, restore correctly.
    allowCustomValue: true,
    positioning: {
      getAnchorElement: () => wrapperRef.current,
    },
    // The machine only knows its own input element, so interactions with the
    // rest of the input frame (the selected-values row, prefix, padding)
    // read as outside and would dismiss the open dropdown — the frame
    // delegates such clicks to the input instead.
    onInteractOutside: (event) => {
      const target = event.detail.originalEvent.target;
      if (target instanceof Node && wrapperRef.current?.contains(target)) {
        event.preventDefault();
      }
    },
    onInputValueChange: ({ inputValue: next }) => {
      setText(next);
    },
    onValueChange: ({ value: nextValues }) => {
      if (multiple) {
        if (nextValues.includes(newValueOptionId)) {
          commitTypedText(inputTextRef.current);
          return;
        }
        if (maxItems !== undefined && nextValues.length > maxItems) {
          return;
        }
        emitMultiChange(nextValues, false);
        if (clearInputOnSelect) {
          setText("");
        }
        return;
      }
      const next = nextValues[0];
      if (next === undefined) {
        return;
      }
      if (next === newValueOptionId) {
        commitTypedText(inputTextRef.current);
      } else {
        commit(next, findComboboxItemByValue(effectiveItems, next));
      }
    },
    onHighlightChange: ({ highlightedValue }) => {
      highlightedValueRef.current = highlightedValue;
    },
    onOpenChange: ({ open, reason }) => {
      openRef.current = open;
      if (open) {
        valueAtOpenRef.current = selectedValuesRef.current;
        setHighlightNavigated(false);
        return;
      }
      if (reason === "escape-key") {
        if (multiple) {
          const atOpen = valueAtOpenRef.current;
          const current = selectedValuesRef.current;
          const unchanged =
            atOpen.length === current.length &&
            atOpen.every((entry, index) => entry === current[index]);
          if (!unchanged) {
            emitMultiChange([...atOpen], false);
          }
        }
        revertInput();
        return;
      }
      // An item-select close (option click, Enter) fires before the
      // machine's value/input callbacks, so the typed text must survive it
      // for them to read — the selection's own re-sync, or the keydown
      // handler around the machine's Enter processing, settles the text.
      if (reason === "item-select") {
        return;
      }
      // Any other close abandons the typed text. Closing never commits —
      // typed text becomes a value only through Enter or the dropdown — so
      // the input snaps back to the committed text (a multi draft clears).
      if (inputTextRef.current !== committedTextRef.current) {
        revertInput();
      }
    },
  });

  // The dropdown exits over an animation (see the selectable-list recipe),
  // and closing is also what abandons typed text — re-filtering on the
  // revert would resize the list mid-exit. While open the dropdown renders
  // live values, mirrored here render-adjusted (as with lastCommittedText
  // above); a closed (exiting) dropdown keeps rendering the last open ones.
  const [displayedDropdown, setDisplayedDropdown] = useState({
    listItems,
    filterQuery,
  });
  if (
    combobox.open &&
    (displayedDropdown.listItems !== listItems ||
      displayedDropdown.filterQuery !== filterQuery)
  ) {
    setDisplayedDropdown({ listItems, filterQuery });
  }

  const selectedIds = useMemo(() => {
    if (multiple) {
      return selectedValues;
    }
    if (committedValue === "") {
      return [];
    }
    const ids = [committedValue];
    // A committed new value re-appears as the "use typed text" option
    if (
      showNewValueOption &&
      committedItem === undefined &&
      inputText === committedText
    ) {
      ids.push(newValueOptionId);
    }
    return ids;
  }, [
    multiple,
    selectedValues,
    committedValue,
    showNewValueOption,
    committedItem,
    inputText,
    committedText,
    newValueOptionId,
  ]);

  const resolvedStyledValue = multiple
    ? undefined
    : committedItem !== undefined &&
        renderSelectedOption !== undefined &&
        inputText === committedText
      ? renderSelectedOption(committedItem.value)
      : styledValue;

  const removeValue = useCallback(
    (val: string) => {
      emitMultiChange(
        selectedValues.filter((entry) => entry !== val),
        false,
      );
    },
    [emitMultiChange, selectedValues],
  );

  const [rowFocused, setRowFocused] = useState(false);
  const chipsRemovable =
    !readonly &&
    !disabled &&
    ((overflow ?? "scroll") === "scroll" || rowFocused);

  const rowItems = useMemo(() => {
    if (!multiple || renderSelectedAll !== undefined) {
      return [];
    }
    const renderChipContent = renderSelectedOption ?? renderOption;
    return selectedValues.map((val) => {
      const text = findComboboxItemByValue(effectiveItems, val)?.text ?? val;
      return {
        name: text,
        // The value is the row identity — display texts can repeat.
        id: val,
        children: (
          <Chip
            size={chipSizeMap[size]}
            removeable={
              chipsRemovable
                ? {
                    onRemove: () => removeValue(val),
                    "aria-label": `Remove ${text}`,
                    tabIndex: -1,
                  }
                : false
            }
          >
            {renderChipContent ? (
              <span className={comboboxChipContentRecipe()}>
                {renderChipContent(val)}
              </span>
            ) : (
              text
            )}
          </Chip>
        ),
      };
    });
  }, [
    multiple,
    renderSelectedAll,
    selectedValues,
    effectiveItems,
    renderSelectedOption,
    renderOption,
    size,
    removeValue,
    chipsRemovable,
  ]);

  const customSelection =
    multiple && renderSelectedAll !== undefined && hasSelection
      ? (renderSelectedAll as (values: string[]) => React.ReactNode)(
          selectedValues,
        )
      : undefined;

  // Every option, disabled included — the total behind the `summary` row
  const optionCount = useMemo(
    () =>
      effectiveItems.reduce<number>(
        (count, entry) => count + ("items" in entry ? entry.items.length : 1),
        0,
      ),
    [effectiveItems],
  );

  const overflowMode = overflow ?? "scroll";
  const contentInset =
    hasSelection && renderSelectedAll === undefined && overflow !== "summary"
      ? ("chips" as const)
      : ("text" as const);
  // Connectors mirror BaseInput's gating: default variant only
  const connectsLeft = !!connectToLeftInput && variant === "default";
  const connectsRight = !!connectToRightInput && variant === "default";
  const multiClasses = comboboxMultiRecipe({
    variant,
    size,
    width,
    invalid: !!invalid,
    disabled: !!disabled,
    loading: !!loading,
    contentInset,
    connectsLeft,
    connectsRight,
  });

  if (readonly) {
    if (multiple) {
      return (
        <span
          ref={mergedWrapperRef as React.Ref<HTMLSpanElement>}
          className={cx(multiClasses.readonly, className)}
          data-testid={testId}
        >
          {customSelection ??
            (overflowMode === "summary" ? (
              <OverflowRow
                items={rowItems}
                separator=", "
                overflow="summary"
                total={optionCount}
              />
            ) : (
              <OverflowRow items={rowItems} overflow={overflowMode} />
            ))}
        </span>
      );
    }
    return (
      <BaseInput
        {...inputProps}
        readonly
        ref={mergedWrapperRef}
        className={className}
        testId={testId}
        variant={variant}
        size={size}
        width={width}
        loading={loading}
        prefix={prefix}
        suffix={suffix}
        placeholder={placeholder}
        value={committedText}
        onChange={() => {}}
        styledValue={resolvedStyledValue}
      />
    );
  }

  const clearSelection = () => {
    if (typeof clearable === "object") {
      if (multiple) {
        setText("");
      }
      clearable.onClear();
      return;
    }
    setText("");
    if (multiple) {
      emitMultiChange([], false);
      return;
    }
    commit("", undefined);
  };

  const arkInputProps = combobox.getInputProps();
  const {
    onKeyDown: arkInputKeyDown,
    onFocus: arkInputFocus,
    onBlur: arkInputBlur,
    ...arkInputAttrs
  } = arkInputProps;
  const inputElementProps = {
    ...arkInputAttrs,
    // The single variant's BaseInput runs its own `onFocus`/`onBlur` props
    // (the consumer's) after these; the multi row has no such second slot, so
    // the consumer's handlers compose here instead.
    onFocus: multiple
      ? (event: React.FocusEvent<HTMLInputElement>) => {
          arkInputFocus?.(event);
          onFocus?.(event);
        }
      : arkInputFocus,
    onBlur: multiple
      ? (event: React.FocusEvent<HTMLInputElement>) => {
          arkInputBlur?.(event);
          onBlur?.(event);
        }
      : arkInputBlur,
    ...(multiple
      ? {
          "aria-required": required === true || undefined,
          "data-testid": testId,
          ...resolveAutoFocusProps(autoFocus),
          ...forwardedInputAttrs,
          spellCheck: spellcheck,
          ref: inputRef,
        }
      : {}),
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement>,
      // The chip row's own keydown handling, handed over by OverflowRow so
      // this handler can order the two machines; absent on the single
      // variant's BaseInput.
      rowKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void,
    ) => {
      if (
        multiple &&
        renderSelectedAll !== undefined &&
        event.key === "Backspace"
      ) {
        // OverflowRow's hold guard, mirrored
        if (!event.repeat) {
          backspaceHoldBeganWithTextRef.current = inputTextRef.current !== "";
        }
        if (
          inputTextRef.current === "" &&
          selectedValuesRef.current.length > 0 &&
          !(event.repeat && backspaceHoldBeganWithTextRef.current)
        ) {
          emitMultiChange(selectedValuesRef.current.slice(0, -1), false);
        }
      }
      // Enter with nothing highlighted acts on the typed text; decided
      // before the machine processes the key (which closes and clears the
      // highlight). Acceptable text commits here in a single combobox — the
      // close that follows only reverts, never commits — while Enter that
      // abandons unacceptable text must not submit a form (applied after,
      // so the machine still sees the key).
      const entersTypedText =
        event.key === "Enter" &&
        openRef.current &&
        highlightedValueRef.current === null &&
        inputTextRef.current !== committedTextRef.current;
      const rejectsTypedText =
        entersTypedText &&
        (newValueOptions === undefined ||
          atMaxItems ||
          isBlockedTypedText(effectiveItems, inputTextRef.current));
      if (!multiple && entersTypedText && !rejectsTypedText) {
        commitTypedText(inputTextRef.current);
        // Snaps loosely-cased text to the named option's text — the
        // item-select close this Enter triggers leaves the text alone.
        revertInput();
      }
      if (event.key === "Escape" && !openRef.current) {
        revertInput();
      }
      if (
        openRef.current &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        setHighlightNavigated(true);
      }
      arkInputKeyDown?.(event);
      // Enter belongs to the combobox machine (selection, or a typed-text
      // commit via the close handler); handing it to the chip row too would
      // submit the draft a second time, and un-prevented it would submit a
      // surrounding form.
      if (multiple && event.key === "Enter") {
        event.preventDefault();
      }
      if (rejectsTypedText) {
        event.preventDefault();
        if (!multiple) {
          // The Enter-triggered close leaves the text alone (item-select);
          // the abandoned text reverts here instead. A multi draft stays:
          // without a close, the user is still editing it.
          revertInput();
        }
      }
      if (multiple) {
        onKeyDown?.(event);
      }
      if (rowKeyDown === undefined || event.defaultPrevented) {
        return;
      }
      // The row's tags machine ignores ArrowLeft/Right while its input reads
      // as an expanded combobox, assuming the arrows belong to our listbox —
      // which only navigates with Up/Down, while the machine's caret-at-start
      // guards already scope chip navigation. Hand those keys over with the
      // two attributes its gate reads masked, so chips stay navigable while
      // the dropdown is open.
      if (
        openRef.current &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        rowKeyDown(maskComboboxRoleFromTagsMachine(event));
        return;
      }
      rowKeyDown(event);
    },
  };

  // The row's keyboard removal (Backspace/Delete on a highlighted or last
  // chip) reports the removed chip by its row identity — the selected value
  // itself (see rowItems' `id`).
  const handleRowRemove = (removedValue: string) => {
    if (!selectedValues.includes(removedValue)) {
      return;
    }
    emitMultiChange(
      selectedValues.filter((entry) => entry !== removedValue),
      false,
    );
  };

  const dropdown = (
    <ArkCombobox.RootProvider value={combobox} lazyMount unmountOnExit asChild>
      <Portal container={portalContainerRef}>
        <ArkCombobox.Positioner className={parkedPopperPositioner}>
          <SelectableList
            as="Combobox"
            className={comboboxDropdownRecipe({ variant })}
            items={displayedDropdown.listItems}
            selected={selectedIds}
            size={size}
            highlightNavigated={highlightNavigated}
            emptyState={
              displayedDropdown.filterQuery === "" || !hasAnyOption
                ? (emptyState ?? "No options available")
                : (noMatchMessage?.(displayedDropdown.filterQuery) ??
                  "No matching options")
            }
          />
        </ArkCombobox.Positioner>
      </Portal>
    </ArkCombobox.RootProvider>
  );

  if (multiple) {
    const showClear = clearable !== undefined && !disabled;
    const hasContentToClear = hasSelection || inputText !== "";
    const rowInput = {
      value: inputText,
      onChange: setText,
      onSubmit: commitTypedText,
      placeholder: hasSelection ? undefined : placeholder,
    };
    const rowKeyboardControl = { onRemove: handleRowRemove };
    const adornmentClasses = baseInputRecipe({ variant, size });
    // Interactions with the combobox's own widget — the frame around the row
    // and the portaled dropdown — must not blur the row's tags machine, or
    // its keyboard chip control would stall until the input re-focuses.
    const handleRowInteractOutside = (event: {
      detail: { originalEvent: Event };
      preventDefault: () => void;
    }) => {
      const target = event.detail.originalEvent.target;
      if (!(target instanceof Node)) {
        return;
      }
      const contentId = document
        .getElementById(multiInputId)
        ?.getAttribute("aria-controls");
      const content = contentId ? document.getElementById(contentId) : null;
      if (wrapperRef.current?.contains(target) || content?.contains(target)) {
        event.preventDefault();
      }
    };
    return (
      <>
        <div
          ref={mergedWrapperRef as React.Ref<HTMLDivElement>}
          className={cx(multiClasses.wrapper, className)}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-to-focus frame delegates to the row's <input> */}
          <div
            className={multiClasses.frame}
            // A press anywhere on the frame — a chip, the summary text, the
            // padding — opens the dropdown and focuses the input, not just a
            // press on the input itself (the machine's openOnClick only
            // watches its own element). It must happen at pointerdown: for a
            // collapsed truncate/summary row, focusing expands the row to
            // chips, and that remount detaches the pressed element so the
            // browser never dispatches the subsequent click. The exception is
            // a chip's remove button, whose press only removes the value.
            onPointerDown={(event) => {
              if (disabled) {
                return;
              }
              const target = event.target;
              if (
                target instanceof Element &&
                (target.closest("[data-chip-segment='remove']") ||
                  target.closest("[data-part='adornment-button']"))
              ) {
                // A chip's remove button and interactive adornments act on
                // their own; they neither open the dropdown nor cede focus.
                return;
              }
              combobox.setOpen(true);
              if (target !== document.getElementById(multiInputId)) {
                // Keep focus with the input instead of the pressed element;
                // a press on the input itself keeps its native focus and
                // caret placement.
                event.preventDefault();
                document.getElementById(multiInputId)?.focus();
              }
            }}
            onClick={(event) => {
              if (disabled) {
                return;
              }
              // Focus/open happen on pointerdown above; the click pass lands
              // focus back on the input after a remove-button press (skipped
              // there) and runs the consumer's handler.
              document.getElementById(multiInputId)?.focus();
              onClick?.(event);
            }}
            onFocus={() => setRowFocused(true)}
            onBlur={(event) => {
              const next = event.relatedTarget;
              if (
                !(next instanceof Node) ||
                !event.currentTarget.contains(next)
              ) {
                setRowFocused(false);
              }
            }}
          >
            {prefix != null &&
              renderAdornment("prefix", prefix, size, adornmentClasses)}
            {connectsLeft && (
              <InputConnector
                className={cx(
                  adornmentClasses.connector,
                  adornmentClasses.connectLeft,
                  prefix != null && adornmentClasses.connectAdornment,
                )}
                data-part="connector"
              />
            )}
            <div className={multiClasses.content}>
              {customSelection !== undefined && (
                <span className={multiClasses.customSelection}>
                  {customSelection}
                </span>
              )}
              {overflowMode === "summary" && renderSelectedAll === undefined ? (
                <OverflowRow
                  className={multiClasses.row}
                  items={rowItems}
                  separator=", "
                  overflow="summary"
                  total={optionCount}
                  withInput={rowInput}
                  withKeyboardControl={rowKeyboardControl}
                  inputElementProps={inputElementProps}
                  onInputInteractOutside={handleRowInteractOutside}
                />
              ) : (
                <OverflowRow
                  className={multiClasses.row}
                  items={rowItems}
                  overflow={
                    renderSelectedAll !== undefined ? "scroll" : overflowMode
                  }
                  withInput={rowInput}
                  withKeyboardControl={rowKeyboardControl}
                  inputElementProps={inputElementProps}
                  onInputInteractOutside={handleRowInteractOutside}
                />
              )}
              {showClear && (
                <button
                  type="button"
                  data-part="clear"
                  onMouseDown={(event) => {
                    // prevents focus from leaving the input, which would
                    // close the dropdown before the click lands
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    clearSelection();
                    document.getElementById(multiInputId)?.focus();
                  }}
                  className={cx(
                    multiClasses.clear,
                    (!clearable || !hasContentToClear) &&
                      multiClasses.hideClear,
                  )}
                  aria-label="Clear input"
                >
                  <Icon
                    name="close"
                    size={iconSizeMap[size]}
                    className={multiClasses.clearIcon}
                  />
                </button>
              )}
            </div>
            {loading && (
              <span className={multiClasses.loading} data-part="loading">
                <LoadingSpinner size={loadingSizeMap[size]} variant="bars" />
              </span>
            )}
            {suffix != null &&
              renderAdornment("suffix", suffix, size, adornmentClasses)}
            {connectsRight && (
              <InputConnector
                className={cx(
                  adornmentClasses.connector,
                  adornmentClasses.connectRight,
                  suffix != null && adornmentClasses.connectAdornment,
                )}
                data-part="connector"
              />
            )}
          </div>
          {/* Native form participation, as a Select's hidden select: `name`
              submits the selection and `required` is valid with any value
              selected — the visible input is only the filter draft, whose
              text must not drive validity or the submitted value. */}
          {(name !== undefined || required === true) && (
            <select
              multiple
              aria-hidden="true"
              tabIndex={-1}
              name={name}
              required={required}
              disabled={disabled}
              value={selectedValues}
              onChange={() => {}}
              className={multiClasses.formMirror}
              onFocus={() => {
                // Validation (reportValidity) focuses the invalid control;
                // hand focus to the real input so the user can act.
                document.getElementById(multiInputId)?.focus();
              }}
            >
              {selectedValues.map((selectedValue) => (
                <option key={selectedValue} value={selectedValue}>
                  {findComboboxItemByValue(effectiveItems, selectedValue)
                    ?.text ?? selectedValue}
                </option>
              ))}
            </select>
          )}
        </div>
        {dropdown}
      </>
    );
  }

  return (
    <>
      <BaseInput
        {...inputProps}
        ref={mergedWrapperRef}
        htmlForId={inputId}
        className={className}
        name={name}
        testId={testId}
        loading={loading}
        width={width}
        prefix={prefix}
        suffix={suffix}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        variant={variant}
        size={size}
        disabled={disabled}
        required={required}
        invalid={invalid}
        placeholder={placeholder}
        value={inputText === "" ? null : inputText}
        onChange={() => {
          // Text changes flow through the machine (inputElementProps) into
          // onInputValueChange; commits flow through onChange above.
        }}
        styledValue={resolvedStyledValue}
        clearable={
          clearable === undefined || clearable === false
            ? clearable
            : { onClear: clearSelection }
        }
        inputElementProps={inputElementProps}
      />
      {dropdown}
    </>
  );
};
