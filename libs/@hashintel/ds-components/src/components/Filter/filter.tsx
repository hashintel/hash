import { createListCollection } from "@ark-ui/react/collection";
import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect } from "@ark-ui/react/select";
import { useMemo, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import {
  flashInvalidInput,
  isRejectedNumberInputKey,
  preventAutocompleteProps,
} from "../../util/form-shared";
import { usePortalContainerRef } from "../../util/portal-container-context";
import { Icon } from "../Icon/icon";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../Menu/SelectableList/selectable-list";
import { getItemId } from "../Menu/SelectableList/selectable-list-util";
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
  slotsForValue,
  flattenOperators,
  inputConfigsOf,
  inputSegmentsOf,
  numberStepOf,
  type LooseOperator,
  type CommittedValue,
  type SlotValue,
} from "./filter-util";
import { filterRecipe } from "./filter.recipe";

import type { FormInputSize } from "../../util/form-shared";

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
 * Operators with `input: null` commit immediately on selection. Escape
 * reverts the draft to the last committed value.
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
  removeable?: {
    removeable: boolean;
    onRemove: () => void;
  };
}) => {
  const looseOperators = operators as unknown as Array<
    ItemOrGroup<LooseOperator>
  >;
  const portalContainerRef = usePortalContainerRef();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const dropdownOpenRef = useRef(false);

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
  const [slots, setSlots] = useState<SlotValue[]>(() =>
    slotsForValue(operatorByKey(value?.key ?? defaultKey), value?.value),
  );

  // Adopt external `value` changes (the "adjust state when props change"
  // pattern) without clobbering the draft while the user is editing.
  const [syncedValue, setSyncedValue] = useState<CommittedValue>(value);
  if (!committedEqual(syncedValue, value)) {
    setSyncedValue(value);
    setDraftKey(value?.key ?? defaultKey);
    setSlots(
      slotsForValue(operatorByKey(value?.key ?? defaultKey), value?.value),
    );
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
    // multi-input operator never fires.
    const complete = isDraftComplete(draftSlots);
    if (!complete && !isDraftCleared(draftSlots)) {
      return;
    }
    const nextValue = complete ? draftValue(operator, draftSlots) : null;
    if (committedEqual(value, { key, value: nextValue })) {
      return;
    }
    operator.onChange?.(nextValue);
    (onChange as unknown as (key: string, value: unknown) => void)(
      key,
      nextValue,
    );
  };

  const focusFirstInput = () => {
    // Double rAF so the focus lands after ark-ui restores focus to the
    // trigger when the dropdown closes.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        inputRefs.current[0]?.focus();
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
    const nextSlots =
      value && value.key === nextKey
        ? slotsForValue(operator, value.value)
        : slotsForValue(operator, null);
    setDraftKey(nextKey);
    setSlots(nextSlots);
    if (inputConfigsOf(operator).length === 0) {
      // No input to fill in: choosing the operator is itself the submission.
      commitDraft(nextKey, nextSlots);
    } else {
      focusFirstInput();
    }
  };

  const handleRootBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    // While the (portaled) dropdown is open focus legitimately sits outside
    // the root, so only blur-commit when it is closed.
    if (dropdownOpenRef.current) {
      return;
    }
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) {
      return;
    }
    commitDraft(draftKey, slots);
  };

  const revertDraft = () => {
    setDraftKey(value?.key ?? defaultKey);
    setSlots(
      slotsForValue(operatorByKey(value?.key ?? defaultKey), value?.value),
    );
  };

  const handleInputKeyDown = (
    event: React.KeyboardEvent<Element>,
    inputIndex: number,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // In a multi-input operator, Enter advances to the next input; only
      // Enter on the last input submits the draft.
      const nextInput = inputRefs.current[inputIndex + 1];
      if (nextInput) {
        nextInput.focus();
        return;
      }
      commitDraft(draftKey, slots);
    } else if (event.key === "Escape") {
      revertDraft();
    }
  };

  const setSlot = (index: number, slotValue: SlotValue) => {
    setSlots((previous) => {
      const next = [...previous];
      next[index] = slotValue;
      return next;
    });
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
  // (regardless of that value's validity); the recipe merges the segments
  // into one unit at rest by hiding the internal dividers.
  const complete = selectedOperator !== undefined && isDraftComplete(slots);
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
        dropdownOpenRef.current = open;
      }}
      disabled={disabled}
      loopFocus={false}
      lazyMount
      unmountOnExit
      ref={rootRef as React.Ref<HTMLDivElement>}
      className={cx(classes.root, className)}
      onBlur={handleRootBlur}
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
        const assignInputRef = (element: HTMLInputElement | null) => {
          inputRefs.current[inputIndex] = element;
        };
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
                const raw = event.target.value;
                if (isText) {
                  setSlot(inputIndex, raw);
                  return;
                }
                const parsed = integer
                  ? Math.trunc(parseInt(raw, 10))
                  : parseFloat(raw);
                setSlot(inputIndex, Number.isNaN(parsed) ? null : parsed);
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
              onFocus={
                isText
                  ? undefined
                  : (event) => {
                      event.currentTarget.addEventListener(
                        "wheel",
                        preventWheel,
                        { passive: false },
                      );
                    }
              }
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
      {removeable?.removeable && (
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
