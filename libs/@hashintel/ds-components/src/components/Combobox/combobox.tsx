import { createListCollection } from "@ark-ui/react/collection";
import { Combobox as ArkCombobox, useCombobox } from "@ark-ui/react/combobox";
import { Portal } from "@ark-ui/react/portal";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMergeRefs } from "use-callback-ref";

import { usePortalContainerRef } from "../../util/portal-container-context";
import {
  type Item,
  type ItemOrGroup,
  SelectableList,
  isCustomItem,
} from "../../util/SelectableList/selectable-list";
import { getItemId } from "../../util/SelectableList/selectable-list-util";
import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { BaseInput } from "../TextInput/base-input";
import {
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

type AllowNewValueOptions = {
  /** If left undefined shows the option when the input does not match an enabled option */
  alwaysShowOption?: boolean;
  /** Customize how the option looks */
  renderOption?: (input: string) => React.ReactNode;
};

export type ComboboxProps<TValue extends string = string> = Omit<
  React.ComponentProps<typeof TextInput>,
  "autocomplete" | "onChange"
> & {
  /**
   * Called when a value is committed. `isNew` is true when the committed value is typed
   * text that resolves to no option — only possible with `allowNewValue`.
   */
  onChange: (value: string, isNew: boolean) => void;
  /** Allow committing typed text that matches no option, offered as an extra dropdown option */
  allowNewValue?: boolean | AllowNewValueOptions;
  items?: Array<ItemOrGroup<ComboboxItem<TValue>>>;
  /** Custom renderer for options in the dropdown. Defaults to the option's `text`. */
  renderItem?: (value: TValue) => React.ReactNode;
  /** Custom renderer for the committed value, shown while the input is unfocused */
  renderSelectedItem?: (value: TValue) => React.ReactNode;
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

const findComboboxItem = <TValue extends string>(
  items: Array<ItemOrGroup<ComboboxItem<TValue>>>,
  matches: (option: ComboboxItem<TValue>) => boolean,
): ComboboxItem<TValue> | undefined => {
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

const findComboboxItemByValue = <TValue extends string>(
  items: Array<ItemOrGroup<ComboboxItem<TValue>>>,
  value: string,
): ComboboxItem<TValue> | undefined =>
  value === ""
    ? undefined
    : findComboboxItem(items, (option) => option.value === value);

/**
 * Typed text names an option when it equals an enabled option's value, or an
 * enabled option's text case-insensitively. Disabled options never match:
 * they cannot be committed by typing.
 */
const findComboboxItemByTypedText = <TValue extends string>(
  items: Array<ItemOrGroup<ComboboxItem<TValue>>>,
  text: string,
): ComboboxItem<TValue> | undefined => {
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
const isBlockedTypedText = <TValue extends string>(
  items: Array<ItemOrGroup<ComboboxItem<TValue>>>,
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
 */
export const Combobox = <TValue extends string>({
  items = [],
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

  const newValueOptions = useMemo<AllowNewValueOptions | undefined>(
    () =>
      allowNewValue === false
        ? undefined
        : allowNewValue === true
          ? {}
          : allowNewValue,
    [allowNewValue],
  );

  const committedValue = value ?? "";
  const committedItem = useMemo(
    () => findComboboxItemByValue(items, committedValue),
    [items, committedValue],
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
  const highlightedValueRef = useRef<string | null>(null);
  const openRef = useRef(false);
  useEffect(() => {
    inputTextRef.current = inputText;
    committedTextRef.current = committedText;
  });

  const setText = (next: string) => {
    if (next === inputTextRef.current) {
      return;
    }
    inputTextRef.current = next;
    setInputText(next);
    onChangeInput?.(next);
  };

  const commit = (
    next: string,
    matchedItem: ComboboxItem<TValue> | undefined,
  ) => {
    const nextValue = matchedItem?.value ?? next;
    committedTextRef.current = matchedItem?.text ?? next;
    if (nextValue !== committedValue) {
      onChange(nextValue, nextValue !== "" && matchedItem === undefined);
    }
  };

  // Typed text commits the option it names — resolved exactly as the create
  // option's visibility decides it — so only genuinely unmatched text becomes
  // a new value. Blocked text commits nothing; the caller's revert handles it.
  const commitTypedText = (text: string) => {
    if (isBlockedTypedText(items, text)) {
      return;
    }
    commit(text, findComboboxItemByTypedText(items, text));
  };

  const revertInput = () => {
    setText(committedTextRef.current);
  };

  // No filter while the input still shows the committed value: the user has
  // not typed yet, so reopening the dropdown lists every option.
  const filterQuery = inputText === committedText ? "" : inputText;

  const hasAnyOption = items.some((entry) =>
    "items" in entry ? entry.items.length > 0 : true,
  );

  const visibleOptions = useMemo<
    Array<ItemOrGroup<ComboboxItem<TValue>>>
  >(() => {
    if (filterQuery === "" || filterAlgorithm === "none") {
      return items;
    }
    const query = filterQuery.toLowerCase();
    const matches = (option: ComboboxItem<TValue>): boolean => {
      if (typeof filterAlgorithm === "function") {
        return filterAlgorithm(filterQuery, option.text, option.value);
      }
      const text = option.text.toLowerCase();
      return filterAlgorithm === "startsWith"
        ? text.startsWith(query)
        : text.includes(query);
    };
    const filtered: Array<ItemOrGroup<ComboboxItem<TValue>>> = [];
    for (const entry of items) {
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
  }, [items, filterQuery, filterAlgorithm]);

  const typedTextNamesOption = useMemo(
    () => findComboboxItemByTypedText(items, inputText) !== undefined,
    [items, inputText],
  );

  const showNewValueOption =
    newValueOptions !== undefined &&
    inputText !== "" &&
    !isBlockedTypedText(items, inputText) &&
    (newValueOptions.alwaysShowOption ?? !typedTextNamesOption);

  const listItems = useMemo<Array<ItemOrGroup<Item>>>(() => {
    const toItem = (option: ComboboxItem<TValue>): Item => ({
      id: option.value,
      text: renderItem ? renderItem(option.value) : option.text,
      disabled: option.disabled,
      selectedStyle: option.selectedStyle ?? "highlight",
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
    renderItem,
    showNewValueOption,
    newValueOptions,
    inputText,
    newValueOptionId,
    size,
  ]);

  const collection = useMemo(() => {
    const valueToText = new Map<string, string>();
    const collect = (option: ComboboxItem<TValue>) => {
      valueToText.set(option.value, option.text);
    };
    for (const entry of items) {
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
  }, [listItems, items, inputText, newValueOptionId]);

  // The machine only receives values that resolve to an option: on a value
  // change it re-derives the input text from the collection, which would
  // "stringify" a committed new value (never in the collection) to an
  // empty input. New values live entirely in this wrapper.
  const machineValue = useMemo(
    () => (committedItem === undefined ? [] : [committedValue]),
    [committedItem, committedValue],
  );

  const combobox = useCombobox({
    collection,
    ids: inputId === undefined ? undefined : { input: inputId },
    inputValue: inputText,
    value: machineValue,
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
      getAnchorRect: () => wrapperRef.current?.getBoundingClientRect() ?? null,
    },
    onInputValueChange: ({ inputValue: next }) => {
      setText(next);
    },
    onValueChange: ({ value: nextValues }) => {
      const next = nextValues[0];
      if (next === undefined) {
        return;
      }
      if (next === newValueOptionId) {
        commitTypedText(inputTextRef.current);
      } else {
        commit(next, findComboboxItemByValue(items, next));
      }
    },
    onHighlightChange: ({ highlightedValue }) => {
      highlightedValueRef.current = highlightedValue;
    },
    onOpenChange: ({ open, reason }) => {
      openRef.current = open;
      if (open) {
        return;
      }
      if (reason === "escape-key") {
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
    committedValue,
    showNewValueOption,
    committedItem,
    inputText,
    committedText,
    newValueOptionId,
  ]);

  const resolvedStyledValue =
    committedItem !== undefined &&
    renderSelectedItem !== undefined &&
    inputText === committedText
      ? renderSelectedItem(committedItem.value)
      : styledValue;

  if (readonly) {
    return (
      <BaseInput
        {...inputProps}
        readonly
        ref={mergedWrapperRef}
        variant={variant}
        size={size}
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
    commit("", undefined);
  };

  const arkInputProps = combobox.getInputProps();
  const { onKeyDown: arkInputKeyDown, ...arkInputAttrs } = arkInputProps;
  const inputElementProps = {
    ...arkInputAttrs,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Enter that abandons unacceptable text must not submit a form; decided
      // before the machine processes the key (which closes and clears the
      // highlight), applied after so the machine still sees the key.
      const rejectsTypedText =
        event.key === "Enter" &&
        openRef.current &&
        highlightedValueRef.current === null &&
        inputTextRef.current !== committedTextRef.current &&
        (newValueOptions === undefined ||
          isBlockedTypedText(items, inputTextRef.current));
      if (event.key === "Escape" && !openRef.current) {
        revertInput();
      }
      arkInputKeyDown?.(event);
      if (rejectsTypedText) {
        event.preventDefault();
      }
    },
  };

  return (
    <>
      <BaseInput
        {...inputProps}
        ref={mergedWrapperRef}
        htmlForId={inputId}
        variant={variant}
        size={size}
        disabled={disabled}
        required={required}
        invalid={invalid}
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
      <ArkCombobox.RootProvider
        value={combobox}
        lazyMount
        unmountOnExit
        asChild
      >
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
    </>
  );
};
