import { createListCollection } from "@ark-ui/react/collection";
import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect, useSelectContext } from "@ark-ui/react/select";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { OverflowRow } from "../../primitives/OverflowRow/overflow-row";
import { hasMultiItemSuffix } from "../../primitives/SelectableList/has-multi-item-suffix";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../../primitives/SelectableList/selectable-list";
import { MultiItemSuffix } from "../../primitives/SelectableList/selectable-list-multi-suffix";
import { SelectableListSearch } from "../../primitives/SelectableList/selectable-list-search";
import { searchEmpty } from "../../primitives/SelectableList/selectable-list-search.recipe";
import { SelectableListSelectionSummary } from "../../primitives/SelectableList/selectable-list-selection-summary";
import {
  type CollapsibleExpansion,
  type CollapsibleFolder,
  type NotCollapsible,
  collectSelectedAncestorIds,
  flattenVisibleItems,
  getItemId,
  getVisibleTabbables,
  useCollapsibleExpansion,
} from "../../primitives/SelectableList/selectable-list-util";
import { resolveAutoFocusProps } from "../../util/form-shared";
import { hasCaretModifier, hasCommandModifier } from "../../util/keyboard";
import { parkedPopperPositioner } from "../../util/popper-positioner";
import { usePortalContainerRef } from "../../util/portal-container-context";
import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { InputConnector } from "../TextInput/input-connector";
import { selectRecipe } from "./select.recipe";

import type {
  FormInputSize,
  FormInputWidth,
  SharedInputProps,
} from "../../util/form-shared";
import type { IconName } from "../Icon/icon";

type SelectItemBase<TValue extends string> = {
  /** Identifies the option; reported to `onChange` when selected */
  value: TValue;
  /** The option's visible label — shown in the trigger while selected, and matched by search and typeahead */
  text: string;
  /** Prevents selecting the option */
  disabled?: boolean;
};

export type SelectItem<TValue extends string = string> =
  SelectItemBase<TValue> &
    (NotCollapsible | CollapsibleFolder<SelectItem<TValue>>);

// Docs-only markers: render nothing, exist so react-docgen can surface the
// `items` entry shapes in the docs prop tables.
export const SelectItemDoc = (_props: SelectItem): null => null;
export const SelectGroupDoc = (_props: {
  /** Identifies the group */
  id: string;
  /** Rendered as an uppercase label above the group's options; an empty string draws a plain divider */
  label: React.ReactNode;
  /** The group's options; groups don't nest */
  items: SelectItem[];
}): null => null;

export type MultiSelectItem<TValue extends string = string> =
  SelectItemBase<TValue> & {
    /** Optional content aligned to the right of the item in the dropdown */
    suffix?: React.ReactNode;
    /** Show an "Only" button while the item is hovered, which sets the selection to just this item. It renders in the suffix position, replacing `suffix` while visible. */
    showOnlyButton?: boolean;
    // selectedStyle: how selection is indicated in the dropdown, defaulting
    // to `checkbox`; selectedTone: the indicator's tone (checkbox fill, tick
    // or highlight color), defaulting to `neutral`. Named after the list
    // `Item` fields they map onto, matching MultiComboboxItem.
  } & Pick<Item, "selectedStyle" | "selectedTone"> &
    (NotCollapsible | CollapsibleFolder<MultiSelectItem<TValue>>);

export const MultiSelectItemDoc = (_props: MultiSelectItem): null => null;

type SelectBaseProps<TValue extends string> = {
  placeholder?: string;
  /** Whether editing is disabled. Unlike `disabled`, strips the input styles and renders the value as plain text. */
  readonly?: boolean;
  /** Whether a loading spinner is shown inside the input. */
  loading?: boolean;
  /** The input's visual style: `subtle` removes the border so it reads as inline text; `naked` strips all input chrome and inherits the surrounding text styles (`size` then only affects the dropdown). */
  variant?: "default" | "subtle" | "naked";
  /** The alignment of the text inside the input. */
  align?: "left" | "center" | "right";
  /** A set of standard widths to choose for the input. You can also set the width with css when aligning with other inputs is not required. */
  width?: FormInputWidth;
  /** Hide the dropdown arrow */
  hideArrow?: boolean;
  /** Element rendered at the start of the input. */
  prefix?: Prefix;
  /** Whether this input renders as connected to the input on its left. Set the matching prop on both inputs; `subtle` and `readonly` inputs are never connected. */
  connectToLeftInput?: boolean;
  /** Whether this input renders as connected to the input on its right. Set the matching prop on both inputs; `subtle` and `readonly` inputs are never connected. */
  connectToRightInput?: boolean;
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
 * dropdown closes and the search resets. While the search field is empty, or
 * the last key press was ArrowUp/ArrowDown, Space toggles the highlighted
 * item instead of typing into the search field. */
type SelectSearchable = {
  onSearch?: (search: string) => void;
};

type SelectSingleProps<TValue extends string> = {
  /** Whether multiple values can be selected. */
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
  /** The options to pick from */
  items: ReadonlyArray<ItemOrGroup<SelectItem<TValue>>>;
  /** Custom renderer for the selected value in the trigger. Defaults to `renderItem`, or the item's `text` if neither is provided. */
  renderSelectedItem?: (value: TValue) => React.ReactNode;
  renderSelectedAll?: never;
} & (
  | {
      required: true;
      /** Whether a required select can be cleared, showing the clear button. */
      clearable?: false;
      /** The current selection, `null`/`undefined` while empty */
      value: NoInfer<TValue>;
      onChange: (value: NoInfer<TValue>) => void;
    }
  | {
      required: true;
      /** Whether a required select can be cleared, showing the clear button. */
      clearable: true;
      /** The current selection, `null`/`undefined` while empty */
      value: NoInfer<TValue> | null | undefined;
      onChange: (value: NoInfer<TValue> | null) => void;
    }
  | {
      required?: false;
      clearable?: never;
      /** The current selection, `null`/`undefined` while empty */
      value: NoInfer<TValue> | null | undefined;
      /** Called with the selected value — `null` when the selection is cleared. */
      onChange: (value: NoInfer<TValue> | null) => void;
    }
);

type SelectMultipleProps<TValue extends string> = {
  /** Whether multiple values can be selected. */
  multiple: true;
  /** The maximum number of values that can be selected. Once reached, unselected items are disabled until a value is deselected. */
  maxItems?: number;
  /** Whether a required select can be cleared, showing the clear button. */
  clearable?: boolean | { onClear: () => void };
  /** How the selected values render in the trigger when no `renderSelectedAll` is given: a row that scrolls horizontally, truncates with a "+X" badge, or summarises the names (falling back to "X of Y" once they no longer fit). */
  overflow?: "scroll" | "truncate" | "summary";
  /** Set to add a search field to the dropdown that filters the items by their text. onSearch is called as the search value changes, including with "" when the dropdown closes and the search resets. */
  searchable?:
    | boolean
    | (SelectSearchable & {
        /** Hide the "x of y" selected count in the selection summary. It is
         * also hidden while `loading`, when the option count is not yet
         * known. */
        hideCount?: boolean;
        /** Hide the "Select all" / "Clear all" toggle in the selection
         * summary. It is also hidden when `maxItems` puts selecting every
         * enabled option out of reach. */
        hideSelectAllToggle?: boolean;
      });
  /** The options to pick from */
  items: ReadonlyArray<ItemOrGroup<MultiSelectItem<TValue>>>;
  /** Custom renderer for the selected value in the trigger. Defaults to `renderItem`, or the item's `text` if neither is provided. */
  renderSelectedItem?: (value: TValue) => React.ReactNode;
  /** Custom renderer for the trigger's entire selection, replacing the per-value row and with it the `overflow` behaviour (and `renderSelectedItem`). */
  renderSelectedAll?: (values: TValue[]) => React.ReactNode;
  required?: boolean;
  /** The current selection, `null`/`undefined` while empty */
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

/**
 * Flattens groups and collapsible folders into the depth-first list of every
 * option, folders included and regardless of their expansion state.
 */
function flattenSelectOptions<TItem extends SelectItem<string>>(
  items: ReadonlyArray<ItemOrGroup<TItem>>,
): TItem[] {
  const result: TItem[] = [];
  const visitItem = (item: TItem) => {
    result.push(item);
    if (item.subItems) {
      for (const child of item.subItems as ReadonlyArray<TItem>) {
        visitItem(child);
      }
    }
  };
  for (const entry of items) {
    if ("items" in entry) {
      for (const item of entry.items) {
        visitItem(item);
      }
    } else {
      visitItem(entry);
    }
  }
  return result;
}

function findSelectItem<TValue extends string>(
  items: ReadonlyArray<ItemOrGroup<SelectItem<TValue>>>,
  value: TValue | null | undefined,
): SelectItem<TValue> | undefined {
  if (value == null) {
    return undefined;
  }
  return flattenSelectOptions(items).find((it) => it.value === value);
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
    /** Whether the option set contains collapsible folders — a single select then marks its selection with a trailing radio, keeping the leading chevron column clean */
    hasCollapsibleFolders: boolean;
  },
): Array<ItemOrGroup<Item>> {
  const toSuffix = (it: MultiSelectItem<TValue>): React.ReactNode =>
    hasMultiItemSuffix(it) ? (
      <MultiItemSuffix
        suffix={it.suffix}
        showOnlyButton={it.showOnlyButton}
        disabled={it.disabled}
        tone={it.selectedTone}
        onSelectOnly={() => options.selectOnly(it.value)}
      />
    ) : undefined;
  const toItem = (it: MultiSelectItem<TValue>): Item => {
    const disabled =
      it.disabled ||
      (options.selectableValues !== undefined &&
        !options.selectableValues.has(it.value));
    const selectedStyle = options.multiple
      ? (it.selectedStyle ?? "checkbox")
      : options.hasCollapsibleFolders
        ? ("radio" as const)
        : ("tick" as const);
    // An option with subItems is a collapsible folder — a selectable option
    // like any other; only its chevron button toggles expansion.
    if (it.subItems) {
      return {
        id: it.value,
        text: renderItem(it.value),
        disabled,
        selectedStyle,
        selectedTone: it.selectedTone,
        suffix: toSuffix(it),
        collapsible: true,
        subItems: it.subItems.map(toItem),
      };
    }
    return {
      id: it.value,
      text: renderItem(it.value),
      disabled,
      selectedStyle,
      selectedTone: it.selectedTone,
      suffix: toSuffix(it),
      subItems: undefined,
      onClick: () => {},
    };
  };
  return items.map((entry) =>
    "items" in entry
      ? { id: entry.id, label: entry.label, items: entry.items.map(toItem) }
      : toItem(entry),
  );
}

/**
 * Exposes the select machine's api to the component body — the context is
 * only readable beneath the Root — backing the Root element's keyboard
 * handling (Tab exiting an open dropdown).
 */
const SelectApiBridge = ({
  onApi,
}: {
  onApi: (api: ReturnType<typeof useSelectContext>) => void;
}) => {
  const select = useSelectContext();
  useLayoutEffect(() => {
    onApi(select);
  });
  return null;
};

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
  renderSelectedAll,
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
  // Per-instance id for the search-empty row — guaranteed not to collide
  // with any consumer-supplied item value.
  const noneValue = useId();

  const canClear = multiple
    ? !!clearable
    : required !== true || clearable === true;
  const showClear =
    (multiple ? clearable !== undefined : canClear) && !disabled;
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

  // The collapsible options' values (those with subItems), wherever they
  // nest — the set held open while searching, and the rows
  // ArrowRight/ArrowLeft can toggle.
  const folderValues = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        flattenSelectOptions(effectiveItems)
          .filter((it) => it.subItems !== undefined)
          .map((it) => it.value),
      ),
    [effectiveItems],
  );
  // Expansion state lives late in the component (it derives from the mapped
  // list items), while the keyboard handlers below close over it — the ref
  // bridges the ordering.
  const expansionRef = useRef<CollapsibleExpansion | null>(null);

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

  const selectApiRef = useRef<ReturnType<typeof useSelectContext> | null>(null);

  const [search, setSearch] = useState("");
  const showSearch = !!searchable;

  // In a searchable select, Space pressed in the search field toggles the
  // highlighted item — instead of typing a space — while the search is empty
  // or the last key press was ArrowUp/ArrowDown (a toggling Space keeps that
  // mode going, so repeated toggles work; any other key returns Space to
  // typing). Runs in the capture phase: the search row's own handler stops
  // Space from reaching zag's content keydown, where an unsearchable select
  // gets its Space-selects behaviour, so the toggle is driven from here via
  // the machine api instead. Single selects mirror Enter and close after
  // selecting.
  const lastKeyWasListNavRef = useRef(false);
  const handleSearchSpaceKeyDown = (event: React.KeyboardEvent): boolean => {
    const api = selectApiRef.current;
    if (
      !api?.open ||
      event.nativeEvent.isComposing ||
      hasCommandModifier(event)
    ) {
      return false;
    }
    const target = event.target as Element;
    if (!target.closest("[data-selectable-list-search]")) {
      return false;
    }
    if (search !== "" && !lastKeyWasListNavRef.current) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    const highlighted = api.highlightedValue;
    if (
      !event.repeat &&
      highlighted !== null &&
      api.collection.has(highlighted)
    ) {
      api.selectValue(highlighted);
      if (!multiple) {
        api.setOpen(false);
      }
    }
    return true;
  };

  // ArrowRight expands and ArrowLeft collapses the highlighted collapsible
  // option — activation (Enter, Space, click) selects it, so the horizontal
  // arrows carry the keyboard toggle. Skipped for keys owned by the search
  // field's caret, and while searching (every folder is held open then).
  const handleCollapsibleArrowKeyDown = (event: React.KeyboardEvent) => {
    const api = selectApiRef.current;
    const expansion = expansionRef.current;
    if (!api?.open || !expansion || hasCaretModifier(event)) {
      return;
    }
    const { target } = event;
    if (
      target instanceof Element &&
      target.closest("[data-selectable-list-custom]")
    ) {
      return;
    }
    if (showSearch && search.trim() !== "") {
      return;
    }
    const highlighted = api.highlightedValue;
    if (highlighted === null || !folderValues.has(highlighted)) {
      return;
    }
    const isExpanded = expansion.expandedIds.has(highlighted);
    if (event.key === "ArrowRight" ? isExpanded : !isExpanded) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    expansion.onToggle(highlighted);
  };

  const [highlightNavigated, setHighlightNavigated] = useState(false);
  // Reactive mirror of the machine's open state, for the dropdown freeze
  // below — `isOpenRef` serves the event handlers, not renders.
  const [isOpen, setIsOpen] = useState(!!defaultOpen);

  // Tab while open moves through the dropdown's own tabbables (search field,
  // custom rows, footer buttons) and past the edge closes the dropdown,
  // handing focus to the document's neighbouring tabbable — zag would
  // otherwise trap focus in the open dropdown. Handled in the capture phase
  // so zag never sees the key; all movement is programmatic.
  const handleTabKeyDown = (event: React.KeyboardEvent) => {
    const api = selectApiRef.current;
    if (!api?.open || hasCommandModifier(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const trigger = internalRef.current;
    const doc = event.currentTarget.ownerDocument;
    const contentId = trigger?.getAttribute("aria-controls");
    const content = contentId ? doc.getElementById(contentId) : null;
    const direction = event.shiftKey ? -1 : 1;
    const tabbables = content ? getVisibleTabbables(content) : [];
    const { activeElement } = doc;
    const index = tabbables.findIndex(
      (el) => el === activeElement || el.contains(activeElement),
    );
    let next: HTMLElement | undefined;
    if (index !== -1) {
      next = tabbables[index + direction];
    } else {
      // Focus sits on a non-tabbable: the content itself, either mid-list
      // (an option highlighted via activedescendant navigation) or fresh
      // from opening. A highlighted option makes the items block a
      // positional stop — partition the tabbables around it, so backward
      // reaches the search field above the list and forward the footer
      // below it. With nothing highlighted, forward enters the first
      // tabbable and backward exits.
      const highlightedId =
        content?.getAttribute("aria-activedescendant") ??
        activeElement?.getAttribute("aria-activedescendant");
      const highlightedOption = highlightedId
        ? doc.getElementById(highlightedId)
        : null;
      if (highlightedOption) {
        const followsOption = (el: HTMLElement) =>
          Boolean(
            // eslint-disable-next-line no-bitwise -- the DOM API returns a bitmask
            highlightedOption.compareDocumentPosition(el) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          );
        next =
          direction === 1
            ? tabbables.find(followsOption)
            : tabbables.filter((el) => !followsOption(el)).at(-1);
      } else if (direction === 1) {
        next = tabbables[0];
      }
    }
    if (next) {
      next.focus();
      return;
    }
    // Past the edge: close, then land focus. zag restores the trigger's
    // focus on close (which covers the backward exit); a forward exit moves
    // on to the document's next tabbable once that restore has flushed —
    // double rAF, as the restore's timing varies with where focus sat.
    api.setOpen(false);
    if (direction === -1 || !trigger) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const follows = (el: HTMLElement) =>
          Boolean(
            // eslint-disable-next-line no-bitwise -- the DOM API returns a bitmask
            trigger.compareDocumentPosition(el) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          );
        const eligible = getVisibleTabbables(doc.body).filter(
          (el) => el !== trigger && !content?.contains(el) && follows(el),
        );
        eligible[0]?.focus();
      });
    });
  };
  const handleRootKeyDownCapture = (event: React.KeyboardEvent) => {
    if (
      selectApiRef.current?.open &&
      (event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "Home" ||
        event.key === "End")
    ) {
      setHighlightNavigated(true);
    }
    let spaceToggled = false;
    if (event.key === "Tab") {
      handleTabKeyDown(event);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (selectApiRef.current?.open) {
        handleCollapsibleArrowKeyDown(event);
      } else {
        // zag changes a closed select's selection on Left/Right — swallow the
        // key before it reaches the trigger so the selection stays put.
        event.stopPropagation();
      }
    } else if (event.key === " " && showSearch) {
      spaceToggled = handleSearchSpaceKeyDown(event);
    }
    lastKeyWasListNavRef.current =
      event.key === "ArrowUp" || event.key === "ArrowDown" || spaceToggled;
  };
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
    // A matching folder keeps its whole subtree; otherwise it stays visible
    // only while a descendant matches, trimmed to the matching ones.
    const filterItems = (
      entries: ReadonlyArray<MultiSelectItem<TValue>>,
    ): Array<MultiSelectItem<TValue>> =>
      entries.flatMap((it): Array<MultiSelectItem<TValue>> => {
        if (it.subItems) {
          if (matches(it)) {
            return [it];
          }
          const children = filterItems(it.subItems);
          return children.length > 0 ? [{ ...it, subItems: children }] : [];
        }
        return matches(it) ? [it] : [];
      });
    const filtered: Array<ItemOrGroup<MultiSelectItem<TValue>>> = [];
    for (const entry of effectiveItems) {
      if ("items" in entry) {
        const children = filterItems(entry.items);
        if (children.length > 0) {
          filtered.push({ ...entry, items: children });
        }
      } else {
        filtered.push(...filterItems([entry]));
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

  // Every option's value, disabled options and collapsible folders included
  // (folders are selectable options too) — the total behind the selection
  // summary and the `summary` overflow row.
  const optionValues = useMemo<TValue[]>(
    () => flattenSelectOptions(effectiveItems).map((it) => it.value),
    [effectiveItems],
  );

  // The value set "Select all" sets: the current selection plus every enabled
  // option, wherever it nests. Disabled options are skipped, and nothing
  // already selected (e.g. a disabled orphan) is dropped.
  const selectAllValues = useMemo<TValue[]>(() => {
    const values = new Set<TValue>(selectedValues);
    for (const it of flattenSelectOptions(effectiveItems)) {
      if (!it.disabled) {
        values.add(it.value);
      }
    }
    return [...values];
  }, [effectiveItems, selectedValues]);

  const overflowMode =
    multiple && !renderSelectedAll ? (overflow ?? "scroll") : undefined;

  const renderSelectedContent = (): React.ReactNode => {
    if (multiple) {
      if (renderSelectedAll) {
        return renderSelectedAll(selectedValues);
      }
      const renderSingle = renderSelectedItem ?? resolvedRenderItem;
      const mode = overflow ?? "scroll";
      const rowItems = selectedValues.map((val) => {
        const children = renderSingle(val);
        return {
          // A plain-string renderer result doubles as the summary-mode text.
          name:
            typeof children === "string"
              ? children
              : (findSelectItem(effectiveItems, val)?.text ?? val),
          children,
        };
      });
      return mode === "summary" ? (
        <OverflowRow
          items={rowItems}
          separator=", "
          overflow="summary"
          // While options load, `effectiveItems` omits the orphans backing
          // the committed selection, so the option count is not yet known —
          // an undefined total keeps the summary from claiming "any".
          total={
            loading && items.length === 0 ? undefined : optionValues.length
          }
        />
      ) : (
        <OverflowRow items={rowItems} separator=", " overflow={mode} />
      );
    }
    const selectedValue = selectedValues[0];
    if (selectedValue === undefined) {
      return "";
    }
    const renderSingle = renderSelectedItem ?? resolvedRenderItem;
    return renderSingle(selectedValue);
  };

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
  // disabled by `maxItems`), or Enter would target an unselectable row. The
  // visible tree also keeps non-matching rows for context (a matching row's
  // folder ancestors, a matching folder's children), which must not take the
  // highlight — Enter targets the first actual match.
  const firstVisibleValue = useMemo<TValue | undefined>(() => {
    const isEnabledMatch = (it: MultiSelectItem<TValue>) => {
      if (
        it.disabled ||
        (selectableAtMaxSet !== undefined && !selectableAtMaxSet.has(it.value))
      ) {
        return false;
      }
      const label = it.text.toLowerCase();
      return searchTerms.every((term) => label.includes(term));
    };
    return flattenSelectOptions(visibleItems).find(isEnabledMatch)?.value;
  }, [visibleItems, selectableAtMaxSet, searchTerms]);

  const selectOnly = useCallback(
    (val: TValue) => {
      (onChange as (value: TValue[]) => void)([val]);
    },
    [onChange],
  );

  // The selection summary of a searchable multi select. Its counts span the
  // whole option set — not the current search filter — and its "Select all"
  // selects every enabled option, leaving disabled options as they are.
  const selectAll = useCallback(() => {
    (onChange as (value: TValue[]) => void)([...selectAllValues]);
  }, [onChange, selectAllValues]);
  const clearAll = useCallback(() => {
    (onChange as (value: TValue[]) => void)([]);
  }, [onChange]);

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
    (maxItems !== undefined && maxItems < selectAllValues.length);

  const selectionSummary =
    showSearch && multiple && !(hideSummaryCount && hideSummaryToggle) ? (
      <SelectableListSelectionSummary
        hideCount={hideSummaryCount}
        hideSelectAllToggle={hideSummaryToggle}
        selectedCount={selectedValues.length}
        totalCount={optionValues.length}
        allSelected={
          hasSelection && selectAllValues.length === selectedValues.length
        }
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
        hasCollapsibleFolders: folderValues.size > 0,
      },
    );
    const searching = searchTerms.length > 0;
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
    resolvedRenderItem,
    noneValue,
    multiple,
    selectableAtMaxSet,
    selectOnly,
    folderValues,
    showSearch,
    searchTerms,
    resolvedEmptyState,
  ]);
  // Expansion state of collapsible folders. Ancestors of the selection start
  // expanded (and re-expand on open, below) so the selection is visible.
  // While searching, every folder on the way to a match must be open for the
  // match to be reachable, so the user's expansion state is overridden (and
  // resumes when the search clears).
  const expansion = useCollapsibleExpansion(
    menuItems,
    new Set<string>(selectedValues),
  );
  useEffect(() => {
    expansionRef.current = expansion;
  });
  const effectiveExpansion = useMemo<CollapsibleExpansion>(
    () =>
      searchTerms.length > 0
        ? // Toggling is a no-op while every folder is held open: on screen
          // nothing would change, but the write would silently flip the
          // underlying state, surprising once the search clears.
          { expandedIds: folderValues, onToggle: () => {} }
        : expansion,
    [searchTerms, folderValues, expansion],
  );

  // The dropdown exits over an animation (see the selectable-list recipe),
  // and closing is also what resets the search — re-filtering on that reset
  // would resize the list mid-exit, and dropping the all-folders-open search
  // override would collapse the folders the rows still paint. While open the
  // dropdown renders live values, mirrored here render-adjusted; a closed
  // (exiting) dropdown keeps rendering the last open ones, the search
  // field's text included.
  const [displayedDropdown, setDisplayedDropdown] = useState({
    menuItems,
    search,
    expansion: effectiveExpansion,
  });
  if (
    isOpen &&
    (displayedDropdown.menuItems !== menuItems ||
      displayedDropdown.search !== search ||
      displayedDropdown.expansion !== effectiveExpansion)
  ) {
    setDisplayedDropdown({ menuItems, search, expansion: effectiveExpansion });
  }

  const collection = useMemo(() => {
    const valueToText = new Map<string, string>();
    for (const it of flattenSelectOptions(effectiveItems)) {
      valueToText.set(it.value, it.text);
    }
    return createListCollection<Item>({
      // Open: the rows currently rendered, in visual order — folders count
      // (they are highlightable, and Enter toggles them), collapsed children
      // and custom rows don't, keeping arrow navigation on what is on
      // screen. Closed: every option, collapsed children included — the
      // closed trigger's typeahead must reach them, and the hidden select
      // renders its form options from the collection, which must cover the
      // selection wherever it hides.
      items: flattenVisibleItems(
        menuItems,
        isOpen ? effectiveExpansion.expandedIds : folderValues,
      ),
      itemToValue: (item) => getItemId(item),
      itemToString: (item) => {
        const id = getItemId(item);
        return valueToText.get(id) ?? id;
      },
      isItemDisabled: (item) => !!item.disabled,
    });
  }, [menuItems, effectiveItems, effectiveExpansion, isOpen, folderValues]);

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
      !!renderItem ||
      !!renderSelectedItem ||
      !!renderSelectedAll ||
      overflowMode !== undefined,
    overflowRow: overflowMode !== undefined,
    clampTriggerHeight:
      (!!renderItem ||
        !!renderSelectedItem ||
        !!renderSelectedAll ||
        overflowMode !== undefined) &&
      (connectsLeft || connectsRight),
    willClear: showClear && canClear && !hasSelection,
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
        if (next !== undefined) {
          (onChange as (value: TValue) => void)(next as TValue);
        }
      }}
      onOpenChange={({ open }) => {
        isOpenRef.current = open;
        setIsOpen(open);
        if (open) {
          escapedRef.current = false;
          valueAtOpenRef.current = selectedValues;
          lastKeyWasListNavRef.current = false;
          setHighlightNavigated(false);
          // Reveal the selection: its collapsed ancestors open with the
          // dropdown, so the selected options are visible from the start.
          expansion.expand?.(
            collectSelectedAncestorIds(menuItems, new Set(selectedValues)),
          );
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
      onKeyDownCapture={handleRootKeyDownCapture}
    >
      <ArkSelect.HiddenSelect ref={inputRef} />
      <SelectApiBridge
        onApi={(api) => {
          selectApiRef.current = api;
        }}
      />
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
            ref={internalRef}
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
                  renderSelectedAll ||
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
                (!canClear || !hasSelection) && classes.hideClear,
              )}
              aria-label="Clear input"
            >
              {/* Stroked rather than the close icon so its weight follows the arrow's */}
              <svg
                viewBox="0 0 10 10"
                aria-hidden="true"
                className={classes.clearIcon}
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M0 0L10 10M10 0L0 10"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
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
        <ArkSelect.Positioner className={parkedPopperPositioner}>
          <SelectableList
            as="Select"
            className={classes.list}
            items={displayedDropdown.menuItems}
            selected={selectedValues}
            size={size}
            expansion={displayedDropdown.expansion}
            highlightNavigated={highlightNavigated}
            emptyState={resolvedEmptyState}
            header={
              showSearch ? (
                <SelectableListSearch
                  value={displayedDropdown.search}
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

// Stable name for the docs Stage code serializer under minification
Select.displayName = "Select";
