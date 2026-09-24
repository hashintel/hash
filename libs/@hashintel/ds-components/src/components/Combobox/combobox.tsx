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
import { usePortalContainerRef } from "../../util/portal-container-context";
import {
  type Item,
  type ItemOrGroup,
  SelectableList,
  isCustomItem,
} from "../../util/SelectableList/selectable-list";
import { renderMultiItemSuffix } from "../../util/SelectableList/selectable-list-multi-suffix";
import { getItemId } from "../../util/SelectableList/selectable-list-util";
import { Chip, type ChipSize } from "../Chip/chip";
import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { BaseInput } from "../TextInput/base-input";
import {
  comboboxChipContentRecipe,
  comboboxMultiRecipe,
  comboboxNewValueOptionRecipe,
  comboboxDropdownRecipe,
} from "./combobox.recipe";

import type { FormInputSize } from "../../util/form-shared";
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
  "autocomplete" | "onChange" | "value"
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
  /**
   * Set to allow selecting multiple values. The selected values render as a
   * row of removable chips inside the input (see `overflow`) with the typed
   * text beside them; a chip's close button deselects its value, and arrow
   * keys walk a chip highlight from an empty input, where Backspace
   * deselects the highlighted (or last) value. The dropdown stays open while
   * toggling items; closing it with Escape reverts the selection to what it
   * was when the dropdown opened (`onChange` fires with the reverted
   * values). Items indicate selection with a checkbox unless they set their
   * own `selectedStyle`. The multi variant composes its own frame around the
   * chip row rather than a text input, so text-input-specific props (e.g.
   * `prefix`/`suffix`, `align`, `styledValue`, `connectToLeftInput`/
   * `connectToRightInput`) only apply to a single-value combobox.
   */
  multiple: true;
  /** The maximum number of values that can be selected. Once reached, unselected items are disabled until a value is deselected. */
  maxItems?: number;
  /** Whether toggling an option in the dropdown (adding or removing a value) clears the typed text. Defaults to true; set to false to keep the text, so one filter can select several matches. Committing typed text as a new value always clears it, and removing values via a chip's close button or Backspace never does. */
  clearInputOnSelect?: boolean;
  /** How the selected values render in the input when no `renderSelectedItem` is given: a chip row that scrolls horizontally (the default), a chip row that truncates with a "+X" badge, or a plain-text summary of the names (falling back to "X of Y" once they no longer fit). */
  overflow?: "scroll" | "truncate" | "summary";
  items?: ReadonlyArray<ItemOrGroup<MultiComboboxItem<TValue>>>;
  /** Custom renderer for options in the dropdown and each selected value's chip content in the input. Defaults to the option's `text`. */
  renderItem?: (value: TValue) => React.ReactNode;
  /** Custom renderer for the selected values in the input, replacing the default overflow row */
  renderSelectedItem?: (values: TValue[]) => React.ReactNode;
  required?: boolean;
} & (
  | {
      /** Allow committing typed text that matches no option, offered as an extra dropdown option. Committed new values list as selected leading options in the dropdown, so they can be deselected like any other value. */
      allowNewValue: true | AllowNewValueOptions;
      value: ReadonlyArray<string>;
      /**
       * Called with the next selection. `isNew` is true when the change added
       * typed text that resolves to no option.
       */
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

// A selected value's chip sits one text-step below the input's own text and
// within the input's height at every size.
const chipSizeMap: Record<FormInputSize, ChipSize> = {
  xxs: "xxs",
  xs: "xs",
  sm: "md",
  md: "lg",
  lg: "xl",
};

/**
 * The chip row's horizontal insets (frame edge → first chip, last chip →
 * typed text) match the vertical gap the centered chips already leave to the
 * frame's top/bottom: (input inner height − chip height) / 2, with the inner
 * height the size's line-height plus twice its `--form-padding-y` and the
 * chip height taken from `chipSizeMap`'s chip at that size. Applied as a CSS
 * variable on the frame, read by the row recipe and the input's own padding.
 *
 *   size | inner height       | chip height        | inset
 *   -----+--------------------+--------------------+------
 *   xxs  | 10×1.6 + 2×1 = 18  | 10×1.2 + 0 +2 = 14 | 2px
 *   xs   | 12×1.6 + 0 = 19.2  | 10×1.4 + 0 +2 = 16 | 1.6px
 *   sm   | 14×1.6 + 2×2 = 26.4| 12×1.5 + 2 +2 = 22 | 2.2px
 *   md   | 16×1.5 + 2×4 = 32  | 14×1.5 + 3 +2 = 26 | 3px
 *   lg   | 16×1.5 + 2×8 = 40  | 16×1.5 + 4 +2 = 30 | 5px
 */
const chipInsetMap: Record<FormInputSize, string> = {
  xxs: "2px",
  xs: "1.6px",
  sm: "2.2px",
  md: "3px",
  lg: "5px",
};

/**
 * The gap between chips in the selected-values row, set as the row's
 * `--overflow-row-gap`. It scales with the chip so density reads the same at
 * every size — roughly a quarter of the chip height (14/16/22/26/30px per
 * `chipSizeMap`), anchored at the row's spacing.1 default around `xs`.
 */
const chipGapMap: Record<FormInputSize, string> = {
  xxs: "3px",
  xs: "4px",
  sm: "5px",
  md: "6px",
  lg: "7px",
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
 * ceding ArrowLeft/Right to an expanded combobox host. Everything else
 * delegates to the real input, and `preventDefault`/`stopPropagation` land
 * on the real event, so the machine's caret handling still works.
 */
const maskComboboxRoleFromTagsMachine = (
  event: React.KeyboardEvent<HTMLInputElement>,
): React.KeyboardEvent<HTMLInputElement> => {
  const input = event.currentTarget;
  const maskedInput = new Proxy(input, {
    get(element, property) {
      if (property === "ariaExpanded") {
        return null;
      }
      if (property === "getAttribute") {
        return (name: string) =>
          name === "role" ? null : element.getAttribute(name);
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
 * dropdown without a selection) reverts the input to the committed value
 * unless `allowNewValue` commits it instead.
 *
 * With `multiple`, `value` is instead the array of selected values, rendered
 * as a row of chips inside the input, and the typed text is a transient
 * filter/draft: committing it or toggling an option clears it (see
 * `clearInputOnSelect`), and closing the dropdown behaves as for a single
 * value — `allowNewValue` commits an abandoned draft, otherwise it is
 * discarded.
 */
export const Combobox = <TValue extends string>({
  items: itemsProp = [],
  multiple,
  maxItems,
  overflow,
  clearInputOnSelect = true,
  renderItem,
  renderSelectedItem,
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
  style,
  className,
  name,
  testId,
  loading,
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

  // The props union is resolved by the explicit `multiple`/`allowNewValue`
  // branches below: items widen to the multi item shape (whose extras are
  // all optional) and values to plain strings, and each `onChange` call site
  // casts back to the arm its branch satisfies.
  const items = itemsProp as ReadonlyArray<ItemOrGroup<MultiComboboxItem>>;
  const renderOption = renderItem as
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

  // Selected values with no backing option (committed new values) surface as
  // synthetic leading options, so they list — and deselect — like any other
  // option and resolve in the machine's collection.
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
  useEffect(() => {
    inputTextRef.current = inputText;
    committedTextRef.current = committedText;
    selectedValuesRef.current = selectedValues;
  });

  const setText = (next: string) => {
    if (next === inputTextRef.current) {
      return;
    }
    inputTextRef.current = next;
    setInputText(next);
    onChangeInput?.(next);
  };

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
  // At maxItems only the currently-selected values stay enabled, so they can be deselected
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

  // Sets the selection to just the given value — backs the per-item "Only"
  // button. Deliberately not the ref-syncing emit: the button's events stop
  // before the machine, so no same-burst callback follows, and a ref write
  // here would read as a render-time ref access from the item mapping below.
  const selectOnly = useCallback(
    (val: string) => {
      (onChange as (value: string[], isNew: boolean) => void)([val], false);
    },
    [onChange],
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
      suffix: multiple
        ? renderMultiItemSuffix({
            suffix: option.suffix,
            showOnlyButton: option.showOnlyButton,
            disabled: option.disabled,
            tone: option.selectedTone,
            onSelectOnly: () => selectOnly(option.value),
          })
        : undefined,
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
    // A multi dropdown stays open across toggles, with the first match
    // highlighted while typing so Enter always has a target. The machine must
    // leave the typed text alone on selection (`preserve`) even when
    // `clearInputOnSelect` asks for clearing: the clear is applied below in
    // onValueChange, after the "use typed text" commit has read the draft —
    // the machine's own `clear` behavior could wipe it first in the same
    // event burst.
    closeOnSelect: !multiple,
    ...(multiple
      ? {
          selectionBehavior: "preserve" as const,
          inputBehavior: "autohighlight" as const,
        }
      : {}),
    disabled,
    invalid,
    required,
    openOnClick: true,
    // The machine (whose prop keeps ark's allowCustomValue name) must never
    // revert/reject typed text itself — commit and revert are decided below
    // (in onOpenChange) so committed new values, which the collection cannot
    // stringify, restore correctly.
    allowCustomValue: true,
    positioning: {
      // The wrapper element itself (not just its rect): the machine has no
      // rendered trigger/control to anchor on, and a bare rect would leave
      // the positioner's auto-update without a context element to track
      // scroll ancestors through — the open dropdown would stay put while
      // the page scrolls.
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
        // The "use typed text" option toggles like any other item, but its
        // sentinel never enters the (controlled) selection — it commits the
        // draft instead.
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
        return;
      }
      if (reason === "escape-key") {
        // A multi combobox treats the open dropdown as a cancellable
        // session: Escape restores the selection from when it opened.
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
      // A selection has already re-synced both texts by the time the close
      // fires, so a difference here means the text was abandoned mid-type.
      if (inputTextRef.current !== committedTextRef.current) {
        if (newValueOptions !== undefined) {
          commitTypedText(inputTextRef.current);
        }
        // No-op after a commit of new text; snaps the input to the option's
        // text when the commit resolved typed text to an option, and reverts
        // abandoned text when there is no commit at all.
        revertInput();
      }
    },
  });

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
        renderSelectedItem !== undefined &&
        inputText === committedText
      ? (renderSelectedItem as (value: string) => React.ReactNode)(
          committedItem.value,
        )
      : styledValue;

  // Removes a single value — backs the chips' remove buttons. Reads the
  // render's selection rather than the ref: chip clicks arrive outside any
  // machine burst, and the chip mapping below runs during render, where a
  // ref-touching callback would count as a render-time ref access.
  const removeValue = useCallback(
    (val: string) => {
      (onChange as (value: string[], isNew: boolean) => void)(
        selectedValues.filter((entry) => entry !== val),
        false,
      );
    },
    [onChange, selectedValues],
  );

  // The selected values of a multi combobox, always visible beside the typed
  // text (unlike `styledValue`, which only shows while unfocused). Each value
  // renders as a removable chip in the OverflowRow that also hosts the text
  // input; the `summary` mode is built from the plain-text names instead. The
  // chips' remove buttons stay out of the tab order — the row's keyboard
  // control (arrows + Backspace) and toggling in the dropdown are the
  // keyboard paths to removal.
  // Whether the row's focus is inside the frame — a collapsed `truncate`/
  // `summary` row hides its chips' remove buttons until focus arrives (which
  // also expands the row to its editable scroll state); a `scroll` row shows
  // them always.
  const [rowFocused, setRowFocused] = useState(false);
  const chipsRemovable =
    !readonly &&
    !disabled &&
    ((overflow ?? "scroll") === "scroll" || rowFocused);

  const rowItems = useMemo(() => {
    if (!multiple || renderSelectedItem !== undefined) {
      return [];
    }
    return selectedValues.map((val) => {
      const text = findComboboxItemByValue(effectiveItems, val)?.text ?? val;
      return {
        name: text,
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
            {renderOption ? (
              <span className={comboboxChipContentRecipe()}>
                {renderOption(val)}
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
    renderSelectedItem,
    selectedValues,
    effectiveItems,
    renderOption,
    size,
    removeValue,
    chipsRemovable,
  ]);

  const customSelection =
    multiple && renderSelectedItem !== undefined && hasSelection
      ? (renderSelectedItem as (values: string[]) => React.ReactNode)(
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
    hasSelection && renderSelectedItem === undefined && overflow !== "summary"
      ? ("chips" as const)
      : ("text" as const);
  const multiClasses = comboboxMultiRecipe({
    variant,
    size,
    width,
    invalid: !!invalid,
    disabled: !!disabled,
    loading: !!loading,
    contentInset,
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
        placeholder={placeholder}
        style={style}
        value={committedText}
        onChange={() => {}}
        styledValue={resolvedStyledValue}
      />
    );
  }

  const clearSelection = () => {
    if (typeof clearable === "object") {
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
      ? { name, "data-testid": testId, ...resolveAutoFocusProps(autoFocus) }
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
        renderSelectedItem !== undefined &&
        event.key === "Backspace" &&
        inputTextRef.current === "" &&
        selectedValuesRef.current.length > 0
      ) {
        // With a custom selection render there are no row items whose tags
        // machine could remove the last value — cover the shortcut here.
        emitMultiChange(selectedValuesRef.current.slice(0, -1), false);
      }
      // Enter that abandons unacceptable text must not submit a form; decided
      // before the machine processes the key (which closes and clears the
      // highlight), applied after so the machine still sees the key.
      const rejectsTypedText =
        event.key === "Enter" &&
        openRef.current &&
        highlightedValueRef.current === null &&
        inputTextRef.current !== committedTextRef.current &&
        (newValueOptions === undefined ||
          atMaxItems ||
          isBlockedTypedText(effectiveItems, inputTextRef.current));
      if (event.key === "Escape" && !openRef.current) {
        revertInput();
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
  // chip) reports the removed chip by its display name; map it back to the
  // first selected value bearing it — the same first-divergence rule the
  // row's machine applied when it picked the chip.
  const handleRowRemove = (removedName: string) => {
    const index = rowItems.findIndex((item) => item.name === removedName);
    if (index === -1) {
      return;
    }
    emitMultiChange(
      selectedValues.filter((_entry, entryIndex) => entryIndex !== index),
      false,
    );
  };

  const dropdown = (
    <ArkCombobox.RootProvider value={combobox} lazyMount unmountOnExit asChild>
      <Portal container={portalContainerRef}>
        <ArkCombobox.Positioner>
          <SelectableList
            as="Combobox"
            className={comboboxDropdownRecipe({ variant })}
            items={listItems}
            selected={selectedIds}
            size={size}
            emptyState={
              filterQuery === "" || !hasAnyOption
                ? (emptyState ?? "No options available")
                : (noMatchMessage?.(filterQuery) ?? "No matching options")
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
          style={
            {
              ...style,
              "--before-input-inset": chipInsetMap[size],
              "--overflow-row-gap": chipGapMap[size],
            } as React.CSSProperties
          }
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
                target.closest("[data-chip-segment='remove']")
              ) {
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
            {customSelection !== undefined && (
              <span className={multiClasses.customSelection}>
                {customSelection}
              </span>
            )}
            {overflowMode === "summary" && renderSelectedItem === undefined ? (
              <OverflowRow
                className={multiClasses.row}
                items={rowItems}
                separator=", "
                overflow="summary"
                total={optionCount}
                withInput={rowInput}
                withKeyboardControl={rowKeyboardControl}
                inputId={multiInputId}
                inputElementProps={inputElementProps}
                onInputInteractOutside={handleRowInteractOutside}
              />
            ) : (
              <OverflowRow
                className={multiClasses.row}
                items={rowItems}
                overflow={
                  renderSelectedItem !== undefined ? "scroll" : overflowMode
                }
                withInput={rowInput}
                withKeyboardControl={rowKeyboardControl}
                inputId={multiInputId}
                inputElementProps={inputElementProps}
                onInputInteractOutside={handleRowInteractOutside}
              />
            )}
            {showClear && (
              <button
                type="button"
                data-part="clear"
                onMouseDown={(event) => {
                  // prevents focus from leaving the input, which would close
                  // the dropdown before the click lands
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
                  (!clearable || !hasContentToClear) && multiClasses.hideClear,
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
            {loading && (
              <span className={multiClasses.loading} data-part="loading">
                <LoadingSpinner size={loadingSizeMap[size]} variant="bars" />
              </span>
            )}
          </div>
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
        style={style}
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
