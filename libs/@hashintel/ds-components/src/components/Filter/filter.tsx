import { createListCollection } from "@ark-ui/react/collection";
import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect } from "@ark-ui/react/select";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import {
  flashInvalidInput,
  isRejectedNumberInputKey,
  preventAutocompleteProps,
} from "../../util/form-shared";
import { usePortalContainerRef } from "../../util/portal-container-context";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../../util/SelectableList/selectable-list";
import { getItemId } from "../../util/SelectableList/selectable-list-util";
import { Icon } from "../Icon/icon";
import { Select } from "../Select/select";
import { BaseTooltip } from "../Tooltip/base-tooltip";
import {
  type FilterChange,
  type FilterValue,
  type InputFor,
  isIntegerConfig,
  committedEqual,
  draftValue,
  isDraftCleared,
  isDraftComplete,
  normalizeSlots,
  slotsForValue,
  flattenOperators,
  inputConfigsOf,
  inputSegmentsOf,
  numberStepOf,
  type LooseOperator,
  type LooseSelectConfig,
  type CommittedValue,
  type SlotValue,
} from "./filter-util";
import { filterRecipe } from "./filter.recipe";

import type { FormInputSize } from "../../util/form-shared";
import type { MultiSelectItem } from "../Select/select";

export type FilterOperator<ValueMap extends Record<string, unknown>> = {
  [Key in keyof ValueMap & string]: {
    key: Key;
    label: string;
    input: InputFor<ValueMap[Key]>;
    onChange?: (value: ValueMap[Key] | null) => void;
  };
}[keyof ValueMap & string];

const caretSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xxs",
  xs: "xxs",
  sm: "xs",
  md: "xs",
  lg: "sm",
};

const dropdownSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xs",
  xs: "sm",
  sm: "sm",
  md: "sm",
  lg: "md",
};

// Stable reference so the focus/blur listener pair always removes the same
// handler. Blocks wheel-stepping a focused number input (mirrors NumberInput).
const preventWheel = (event: WheelEvent) => {
  event.preventDefault();
};

/**
 * Exposes a segment's full content as a `title` tooltip only while it is
 * actually truncated. Measured on every hover (native tooltips appear well
 * after mouseenter, so setting the attribute here is early enough), which
 * keeps it self-healing across resizes and edits. Measures the
 * `[data-truncates]` descendant when present (the trigger's label span),
 * otherwise the hovered element itself; a focused input scrolls rather than
 * truncates, so it never gets a title.
 */
const syncTruncationTitle = (event: React.MouseEvent<HTMLElement>) => {
  const host = event.currentTarget;
  const measured = host.querySelector("[data-truncates]") ?? host;
  const truncated =
    measured !== document.activeElement &&
    measured.scrollWidth > measured.clientWidth;
  const text =
    measured instanceof HTMLInputElement
      ? measured.value
      : measured.textContent;
  if (truncated && text) {
    host.title = text;
  } else {
    host.removeAttribute("title");
  }
};

const FilterSelectInput = ({
  config,
  slot,
  size,
  disabled,
  invalid,
  defaultOpen,
  ariaLabel,
  assignRef,
  onSlotChange,
  onOpenChange,
}: {
  config: LooseSelectConfig;
  slot: SlotValue;
  size: FormInputSize;
  disabled?: boolean;
  invalid?: boolean;
  /** Mount with the dropdown already open (a fresh operator's first input) */
  defaultOpen?: boolean;
  ariaLabel: string;
  assignRef: (element: HTMLElement | null) => void;
  onSlotChange: (value: SlotValue) => void;
  onOpenChange: (open: boolean) => void;
}) => {
  const { items } = config;
  const isAsync = typeof items === "function";
  const [loadedItems, setLoadedItems] = useState<ReadonlyArray<
    ItemOrGroup<MultiSelectItem>
  > | null>(null);
  // An async `items` loader runs once per mount: loaders are usually inline,
  // giving `items` a new identity every render, which must not refetch — the
  // ref bails out of every effect run after the first. Switching operators
  // remounts the segment and so loads afresh. A resolution after unmount is
  // fine: setState is then a no-op.
  const startedLoadRef = useRef(false);
  useEffect(() => {
    if (typeof items !== "function" || startedLoadRef.current) {
      return;
    }
    startedLoadRef.current = true;
    void items().then(
      (result) => setLoadedItems(result),
      // A failed load leaves no options, surfacing the select's emptyState
      () => setLoadedItems([]),
    );
  }, [items]);

  const resolvedItems = isAsync ? (loadedItems ?? []) : items;
  const shared = {
    variant: "naked" as const,
    width: "fitContent" as const,
    size,
    disabled,
    invalid,
    loading: isAsync && loadedItems === null,
    placeholder: config.placeholder,
    emptyState: config.emptyState,
    renderItem: config.renderItem,
    defaultOpen,
    onOpenChange,
    ref: assignRef,
    "aria-label": ariaLabel,
  };
  if (config.multiple) {
    return (
      <Select
        {...shared}
        multiple
        items={resolvedItems}
        searchable={config.searchable}
        maxItems={config.maxItems}
        overflow={config.overflow}
        renderSelectedItem={config.renderSelectedItem}
        value={Array.isArray(slot) ? slot : []}
        onChange={(next) => onSlotChange(next)}
        hideArrow
      />
    );
  }
  return (
    <Select
      {...shared}
      multiple={false}
      items={resolvedItems}
      searchable={config.searchable}
      renderSelectedItem={config.renderSelectedItem}
      value={typeof slot === "string" ? slot : null}
      onChange={(next) => onSlotChange(next ?? null)}
      hideArrow
    />
  );
};

/**
 * An inline, chip-like filter control: a property label, an operator
 * dropdown, and — once an operator is chosen — that operator's input(s).
 *
 * `ValueMap` is hand-passed and maps each operator key to the value type its
 * input produces, e.g.
 * `<Filter<{ contains: string; between: [string, number]; empty: null }>>`.
 *
 * `onChange` (and the selected operator's own `onChange`) fires only once
 * every input is filled in and the user either presses Enter or moves focus
 * outside the control. Clearing every input and submitting the same way
 * fires `(key, null)`; a partially filled multi-input draft never fires.
 * Operators with `input: null` commit immediately on selection. Select
 * inputs additionally commit when their dropdown closes — except when it
 * closes via Escape, which cancels without committing: a single select's
 * value is unchanged and a multi select reverts to the selection it had
 * when its dropdown opened. Escape in a text input restores the value that
 * input held when it received focus; Escape on a closed dropdown does
 * nothing.
 */
export const Filter = <
  ValueMap extends Record<string, unknown> = Record<string, unknown>,
>({
  className,
  property,
  propertyLabel,
  operators,
  value = null,
  onChange,
  errors,
  disabled,
  testId,
  size = "sm",
  removeable,
}: {
  className?: string;
  property: string;
  propertyLabel: string;
  operators: ItemOrGroup<FilterOperator<ValueMap>>[];
  value?: FilterValue<ValueMap> | null;
  onChange: (...change: FilterChange<ValueMap>) => void;
  /** Validation errors, shown in a tooltip below the filter on hover/focus */
  errors?: string[];
  disabled?: boolean;
  testId?: string;
  /** The size (height) of the element */
  size?: FormInputSize;
  removeable?: false | { onRemove: () => void };
}) => {
  const looseOperators = operators as unknown as Array<
    ItemOrGroup<LooseOperator>
  >;
  const portalContainerRef = usePortalContainerRef();
  const rootRef = useRef<HTMLDivElement>(null);
  const operatorTriggerRef = useRef<HTMLButtonElement>(null);
  const inputRefs = useRef<Array<HTMLElement | null>>([]);
  const operatorDropdownOpenRef = useRef(false);
  const selectDropdownOpenRef = useRef(false);
  const selectEscapedRef = useRef(false);
  // The value the focused text/number input held when it received focus
  const inputFocusValueRef = useRef<SlotValue>(null);
  useEffect(() => {
    const markEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectDropdownOpenRef.current) {
        selectEscapedRef.current = true;
      }
    };
    window.addEventListener("keydown", markEscape, true);
    return () => {
      window.removeEventListener("keydown", markEscape, true);
    };
  }, []);

  const flatOperators = useMemo(
    () => flattenOperators(looseOperators),
    [looseOperators],
  );
  const operatorByKey = (key: string | null | undefined) =>
    key == null
      ? undefined
      : flatOperators.find((operator) => operator.key === key);

  // A lone operator is not a choice: it is always selected (and displayed),
  // even while the value is null.
  const defaultKey =
    flatOperators.length === 1 ? (flatOperators[0]?.key ?? null) : null;

  const [draftKey, setDraftKey] = useState<string | null>(
    value?.key ?? defaultKey,
  );
  // The operator whose first (select) input should mount with its dropdown
  // already open — set when the user picks that operator, so the segment
  // renders open in the same commit and never paints a closed frame.
  const [autoOpenKey, setAutoOpenKey] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotValue[]>(() =>
    slotsForValue(operatorByKey(value?.key ?? defaultKey), value?.value),
  );
  // Mirrors `slots` so handlers that fire before a pending update re-renders
  // (a select's close event follows its change event within one click) can
  // read the latest draft. Event handlers write it eagerly via applySlots;
  // render-time updates (the sync block below) land via the layout effect,
  // which runs before any subsequent user event.
  const slotsRef = useRef(slots);
  useLayoutEffect(() => {
    slotsRef.current = slots;
  });
  const applySlots = (next: SlotValue[]) => {
    slotsRef.current = next;
    setSlots(next);
  };

  // Adopt external `value` changes (the "adjust state when props change"
  // pattern) without clobbering the draft while the user is editing.
  const [syncedValue, setSyncedValue] = useState<CommittedValue>(value);
  if (!committedEqual(syncedValue, value)) {
    setSyncedValue(value);
    setDraftKey(value?.key ?? defaultKey);
    setAutoOpenKey(null);
    setSlots(
      slotsForValue(operatorByKey(value?.key ?? defaultKey), value?.value),
    );
  } else if (
    value === null &&
    defaultKey !== null &&
    !operatorByKey(draftKey)
  ) {
    // `operators` changed while `value` stayed null: re-apply the
    // lone-operator default when the draft no longer names an operator.
    setDraftKey(defaultKey);
    setAutoOpenKey(null);
    setSlots(slotsForValue(operatorByKey(defaultKey), null));
  }

  const commitDraft = (key: string | null, draftSlots: SlotValue[]) => {
    if (disabled || key === null) {
      return;
    }
    const operator = operatorByKey(key);
    if (!operator) {
      return;
    }
    // A fully filled draft commits its value and a fully cleared one commits
    // null (clearing this filter's value); a partially filled draft of a
    // multi-input operator never fires. Number slots are judged on their
    // parsed value, so an unparseable remnant like a lone "-" counts as empty.
    const normalized = normalizeSlots(operator, draftSlots);
    const complete = isDraftComplete(normalized);
    if (!complete && !isDraftCleared(normalized)) {
      return;
    }
    // Tidy the visible draft (e.g. "5." → 5) even when the commit is a no-op.
    applySlots(normalized);
    const nextValue = complete ? draftValue(operator, normalized) : null;
    if (committedEqual(value, { key, value: nextValue })) {
      return;
    }
    operator.onChange?.(nextValue);
    (onChange as unknown as (key: string, value: unknown) => void)(
      key,
      nextValue,
    );
  };

  const focusSlot = (index: number) => {
    const element = inputRefs.current[index];
    if (!element) {
      return;
    }
    if (element instanceof HTMLInputElement) {
      element.focus();
      return;
    }
    element.querySelector<HTMLElement>("[data-part=trigger]")?.focus();
  };

  const focusFirstInput = () => {
    // Double rAF so the focus lands after ark-ui restores focus to the
    // trigger when the dropdown closes.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusSlot(0);
      });
    });
  };

  const handleOperatorSelect = (nextKey: string | undefined) => {
    if (nextKey === undefined || nextKey === draftKey) {
      return;
    }
    const operator = operatorByKey(nextKey);
    if (!operator) {
      return;
    }
    const configs = inputConfigsOf(operator);
    const nextSlots =
      value && value.key === nextKey
        ? slotsForValue(operator, value.value)
        : slotsForValue(operator, null);
    setDraftKey(nextKey);
    applySlots(nextSlots);
    if (configs.length === 0) {
      // No input to fill in: choosing the operator is itself the submission.
      commitDraft(nextKey, nextSlots);
      setAutoOpenKey(null);
      return;
    }
    // A leading select input mounts with its dropdown already open (in the
    // same commit — opening after the fact would paint a closed frame
    // first). Ark fires no onOpenChange for that initial state, so the
    // open-tracking ref is seeded here.
    const autoOpen = configs[0]?.type === "select";
    setAutoOpenKey(autoOpen ? nextKey : null);
    if (autoOpen) {
      selectDropdownOpenRef.current = true;
    }
    focusFirstInput();
  };

  const handleRootBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    // While a (portaled) dropdown is open focus legitimately sits outside
    // the root, so only blur-commit when every dropdown is closed.
    if (operatorDropdownOpenRef.current || selectDropdownOpenRef.current) {
      return;
    }
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) {
      return;
    }
    commitDraft(draftKey, slotsRef.current);
  };

  const setSlot = (index: number, slotValue: SlotValue) => {
    const next = [...slotsRef.current];
    next[index] = slotValue;
    applySlots(next);
  };

  // Left/Right move focus between the chip's segments — the operator trigger
  // and each input, clamped to the chip (never the remove button, never
  // outside it). Inside a text input the jump only happens once the caret
  // sits at the matching edge, so arrows still move the caret; a number
  // input hides its caret position, so it only jumps while empty. Open
  // dropdowns keep arrow keys for themselves.
  const handleArrowKeyCapture = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    if (operatorDropdownOpenRef.current || selectDropdownOpenRef.current) {
      return;
    }
    const { target } = event;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const stops: HTMLElement[] = [];
    if (operatorTriggerRef.current) {
      stops.push(operatorTriggerRef.current);
    }
    for (const element of inputRefs.current) {
      if (!element?.isConnected) {
        continue;
      }
      if (element instanceof HTMLInputElement) {
        stops.push(element);
      } else {
        const trigger = element.querySelector<HTMLElement>(
          "[data-part=trigger]",
        );
        if (trigger) {
          stops.push(trigger);
        }
      }
    }
    const index = stops.findIndex((el) => el === target || el.contains(target));
    if (index === -1) {
      return;
    }
    if (target instanceof HTMLInputElement) {
      const { selectionStart, selectionEnd, value: text } = target;
      if (selectionStart === null) {
        // A number input exposes no caret position: keep arrows for the
        // caret unless there is nothing to move through.
        if (text !== "") {
          return;
        }
      } else {
        const atStart = selectionStart === 0 && selectionEnd === 0;
        const atEnd =
          selectionStart === text.length && selectionEnd === text.length;
        if (direction === -1 ? !atStart : !atEnd) {
          return;
        }
      }
    }
    if (event.repeat) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const next = stops[index + direction];
    if (!next) {
      return;
    }
    next.focus();
    if (next instanceof HTMLInputElement && next.type === "text") {
      const position = direction === 1 ? 0 : next.value.length;
      next.setSelectionRange(position, position);
    }
  };

  const handleInputKeyDown = (
    event: React.KeyboardEvent<Element>,
    inputIndex: number,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // In a multi-input operator, Enter advances to the next input; only
      // Enter on the last input submits the draft.
      if (inputRefs.current[inputIndex + 1]) {
        focusSlot(inputIndex + 1);
        return;
      }
      commitDraft(draftKey, slotsRef.current);
    } else if (event.key === "Escape") {
      // Restore the value this input held when it received focus
      setSlot(inputIndex, inputFocusValueRef.current);
    }
  };

  const handleSelectOpenChange = (open: boolean) => {
    selectDropdownOpenRef.current = open;
    if (open) {
      selectEscapedRef.current = false;
      return;
    }
    if (selectEscapedRef.current) {
      selectEscapedRef.current = false;
      return;
    }
    commitDraft(draftKey, slotsRef.current);
  };

  const menuItems = useMemo<Array<ItemOrGroup<Item>>>(() => {
    const toItem = (operator: LooseOperator): Item => ({
      id: operator.key,
      text: operator.label,
      selectedStyle: "tick",
      onClick: () => {},
    });
    return looseOperators.map((entry) =>
      "items" in entry
        ? { id: entry.id, label: entry.label, items: entry.items.map(toItem) }
        : toItem(entry),
    );
  }, [looseOperators]);

  const collection = useMemo(() => {
    const labelByKey = new Map(
      flatOperators.map((operator) => [operator.key, operator.label]),
    );
    const flatItems: Item[] = [];
    for (const entry of menuItems) {
      if ("items" in entry) {
        flatItems.push(...entry.items);
      } else {
        flatItems.push(entry);
      }
    }
    return createListCollection<Item>({
      items: flatItems,
      itemToValue: (item) => getItemId(item),
      itemToString: (item) =>
        labelByKey.get(getItemId(item)) ?? getItemId(item),
      isItemDisabled: (item) => !!item.disabled,
    });
  }, [menuItems, flatOperators]);

  const selectableOperators = flatOperators.length > 1;
  const selectedOperator = operatorByKey(draftKey);
  const inputSegments = selectedOperator
    ? inputSegmentsOf(selectedOperator)
    : [];
  const inputCount = inputSegments.filter(
    (segment) => segment.kind === "input",
  ).length;
  const invalid = !!errors && errors.length > 0;
  // Complete = an operator is selected and every input slot holds a value
  // (number slots one that parses); the recipe merges the segments into one
  // unit at rest by hiding the internal dividers.
  const complete =
    selectedOperator !== undefined &&
    isDraftComplete(normalizeSlots(selectedOperator, slots));
  const classes = filterRecipe({
    size,
    invalid,
    disabled: !!disabled,
    complete,
  });

  const chip = (
    <ArkSelect.Root
      collection={collection}
      value={draftKey === null ? [] : [draftKey]}
      onValueChange={({ value: nextValue }) =>
        handleOperatorSelect(nextValue[0])
      }
      onOpenChange={({ open }) => {
        operatorDropdownOpenRef.current = open;
      }}
      disabled={disabled}
      loopFocus={false}
      lazyMount
      unmountOnExit
      ref={rootRef as React.Ref<HTMLDivElement>}
      className={cx(classes.root, className)}
      onBlur={handleRootBlur}
      onKeyDownCapture={handleArrowKeyCapture}
      role="group"
      aria-label={`${propertyLabel} filter`}
      data-testid={testId}
      data-property={property}
    >
      {selectableOperators && <ArkSelect.HiddenSelect />}
      <span className={classes.property} onMouseEnter={syncTruncationTitle}>
        {propertyLabel}
      </span>
      {/* A single operator is fixed rather than selectable, so its segment is
          a plain non-interactive span; with no operators there is no segment */}
      {selectableOperators ? (
        <ArkSelect.Trigger
          ref={operatorTriggerRef}
          className={classes.trigger}
          data-placeholder={selectedOperator ? undefined : ""}
          aria-label={`${propertyLabel} operator`}
          onMouseEnter={syncTruncationTitle}
        >
          <span className={classes.triggerLabel} data-truncates="">
            {selectedOperator?.label ?? "is…"}
          </span>
          {!selectedOperator && (
            <Icon name="chevronDown" size={caretSizeMap[size]} />
          )}
        </ArkSelect.Trigger>
      ) : selectedOperator ? (
        <span
          className={classes.trigger}
          data-static=""
          onMouseEnter={syncTruncationTitle}
        >
          <span className={classes.triggerLabel} data-truncates="">
            {selectedOperator.label}
          </span>
        </span>
      ) : null}
      {inputSegments.map((segment, position) => {
        // Positional keys are correct here: segments have no identity beyond
        // their position, and draftKey remounts them per operator.
        const segmentKey = `${draftKey}-${position}`;
        if (segment.kind === "separator") {
          return (
            <span
              className={classes.separator}
              aria-hidden="true"
              key={segmentKey}
            >
              {typeof segment.separator === "string" ? (
                segment.separator
              ) : (
                <Icon
                  name={segment.separator.iconName}
                  size={caretSizeMap[size]}
                />
              )}
            </span>
          );
        }
        const { config, inputIndex } = segment;
        const valueLabel = inputCount > 1 ? `value ${inputIndex + 1}` : "value";
        const ariaLabel = `${propertyLabel} ${selectedOperator?.label ?? ""} ${valueLabel}`;
        const assignInputRef = (element: HTMLElement | null) => {
          inputRefs.current[inputIndex] = element;
        };
        if (config.type === "select") {
          return (
            <span
              className={cx(classes.inputSlot, classes.selectSlot)}
              data-disabled={disabled ? "" : undefined}
              key={segmentKey}
            >
              <FilterSelectInput
                config={config}
                slot={slots[inputIndex] ?? null}
                size={size}
                disabled={disabled}
                invalid={invalid}
                defaultOpen={inputIndex === 0 && draftKey === autoOpenKey}
                ariaLabel={ariaLabel}
                assignRef={assignInputRef}
                onSlotChange={(next) => setSlot(inputIndex, next)}
                onOpenChange={handleSelectOpenChange}
              />
            </span>
          );
        }
        const isText = config.type === "string";
        const integer = !isText && isIntegerConfig(config);

        return (
          <span
            className={classes.inputSlot}
            data-disabled={disabled ? "" : undefined}
            key={segmentKey}
          >
            <input
              ref={assignInputRef}
              className={classes.input}
              onMouseEnter={syncTruncationTitle}
              type={isText ? "text" : "number"}
              inputMode={isText ? undefined : integer ? "numeric" : "decimal"}
              value={String(slots[inputIndex] ?? "")}
              onChange={(event) => {
                // Store the raw string so intermediate states like "-" and
                // "1." survive the controlled round-trip; commitDraft
                // resolves number slots via normalizeSlots.
                setSlot(inputIndex, event.target.value);
              }}
              placeholder={config.placeholder}
              minLength={isText ? config.min : undefined}
              maxLength={isText ? config.max : undefined}
              pattern={isText ? config.pattern : undefined}
              min={isText ? undefined : config.min}
              max={isText ? undefined : config.max}
              step={isText ? undefined : numberStepOf(config)}
              onKeyDown={(event) => {
                handleInputKeyDown(event, inputIndex);
                if (
                  !isText &&
                  !event.defaultPrevented &&
                  isRejectedNumberInputKey(event, integer)
                ) {
                  event.preventDefault();
                  flashInvalidInput(event.currentTarget);
                }
              }}
              onFocus={(event) => {
                inputFocusValueRef.current =
                  slotsRef.current[inputIndex] ?? null;
                if (!isText) {
                  event.currentTarget.addEventListener("wheel", preventWheel, {
                    passive: false,
                  });
                }
              }}
              onBlur={
                isText
                  ? undefined
                  : (event) => {
                      event.currentTarget.removeEventListener(
                        "wheel",
                        preventWheel,
                      );
                    }
              }
              disabled={disabled}
              aria-invalid={invalid || undefined}
              aria-label={ariaLabel}
              {...preventAutocompleteProps}
            />
          </span>
        );
      })}
      {/* Deliberately never disabled: `disabled` freezes the operator and
          inputs, but the filter can still be removed. */}
      {removeable && (
        <button
          type="button"
          data-part="remove"
          className={classes.remove}
          onClick={removeable.onRemove}
          aria-label={`Remove ${propertyLabel} filter`}
        >
          <Icon name="close" size={caretSizeMap[size]} />
        </button>
      )}
      {selectableOperators && (
        <Portal container={portalContainerRef}>
          <ArkSelect.Positioner>
            <SelectableList
              as="Select"
              items={menuItems}
              selected={draftKey === null ? [] : [draftKey]}
              size={dropdownSizeMap[size]}
              emptyState="No operators available"
            />
          </ArkSelect.Positioner>
        </Portal>
      )}
    </ArkSelect.Root>
  );

  return (
    <BaseTooltip
      disableTooltip={!invalid}
      position="bottom-start"
      openDelay="fast"
      closeDelay="fast"
      gapY={4}
      content={
        <div className={classes.errorTooltip}>
          {errors?.map((error, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <span className={classes.errorRow} key={index}>
              <Icon name="error" className={classes.errorIcon} />
              {error}
            </span>
          ))}
        </div>
      }
    >
      {chip}
    </BaseTooltip>
  );
};
