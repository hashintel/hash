import { createListCollection } from "@ark-ui/react/collection";
import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect } from "@ark-ui/react/select";
import { useMemo, useRef, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { Icon } from "../Icon/icon";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../Menu/SelectableList/selectable-list";
import { getItemId } from "../Menu/SelectableList/selectable-list-util";
import { NumberInput } from "../NumberInput/number-input";
import { TextInput } from "../TextInput/text-input";
import { filterRecipe } from "./filter.recipe";

import type { FormInputSize } from "../../util/form-shared";
import type { FilterChange, FilterValue, InputFor } from "./filter-util";

export type FilterOperator<ValueMap extends Record<string, unknown>> = {
  [Key in keyof ValueMap & string]: {
    key: Key;
    label: string;
    input: InputFor<ValueMap[Key]>;
    onChange?: (value: ValueMap[Key] | null) => void;
    tooltip?: string | React.ReactNode;
  };
}[keyof ValueMap & string];

/**
 * The ValueMap machinery above types the consumer surface; internally the
 * component works against this untyped shape and casts at the boundary.
 */
type LooseInputConfig = {
  type: "string" | "number" | "int" | "float";
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
};

type LooseOperator = {
  key: string;
  label: string;
  input: LooseInputConfig | ReadonlyArray<LooseInputConfig | string> | null;
  onChange?: (value: unknown) => void;
  tooltip?: string | React.ReactNode;
};

type SlotValue = string | number | null;
type CommittedValue = { key: string; value: unknown } | null;

/**
 * One rendered segment of an operator's input area. String entries in an
 * input array are static separator text (e.g. "-" in a range); they carry no
 * value, so slots/values are indexed by `inputIndex`, which counts only the
 * actual inputs.
 */
type InputSegment =
  | { kind: "input"; config: LooseInputConfig; inputIndex: number }
  | { kind: "separator"; text: string };

const inputSegmentsOf = (operator: LooseOperator): InputSegment[] => {
  const { input } = operator;
  if (input === null) {
    return [];
  }
  // `in` narrowing sidesteps Array.isArray's `any[]` narrowing of ReadonlyArray
  const entries = "type" in input ? [input] : input;
  const segments: InputSegment[] = [];
  let inputIndex = 0;
  for (const entry of entries) {
    if (typeof entry === "string") {
      segments.push({ kind: "separator", text: entry });
    } else {
      segments.push({ kind: "input", config: entry, inputIndex });
      inputIndex += 1;
    }
  }
  return segments;
};

const inputConfigsOf = (
  operator: LooseOperator,
): ReadonlyArray<LooseInputConfig> =>
  inputSegmentsOf(operator)
    .filter((segment) => segment.kind === "input")
    .map((segment) => segment.config);

const flattenOperators = (
  operators: ReadonlyArray<ItemOrGroup<LooseOperator>>,
): LooseOperator[] =>
  operators.flatMap((entry) => ("items" in entry ? entry.items : [entry]));

const slotsForValue = (
  operator: LooseOperator | undefined,
  committed: unknown,
): SlotValue[] => {
  if (!operator) {
    return [];
  }
  const configs = inputConfigsOf(operator);
  if (committed == null) {
    return configs.map(() => null);
  }
  if (Array.isArray(committed)) {
    return configs.map((_, index) => (committed[index] as SlotValue) ?? null);
  }
  return configs.map((_, index) =>
    index === 0 ? (committed as SlotValue) : null,
  );
};

const isDraftComplete = (slots: SlotValue[]) =>
  slots.every((slot) => slot !== null && slot !== "");

const draftValue = (operator: LooseOperator, slots: SlotValue[]): unknown => {
  if (operator.input === null) {
    return null;
  }
  return Array.isArray(operator.input) ? [...slots] : (slots[0] ?? null);
};

const scalarOrTupleEqual = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((entry, index) => entry === b[index])
    : a === b;

const committedEqual = (a: CommittedValue, b: CommittedValue): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.key === b.key &&
    scalarOrTupleEqual(a.value, b.value));

const caretSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xxs",
  xs: "xxs",
  sm: "xs",
  md: "xs",
  lg: "sm",
};

// The embedded input whose text style matches the chip's font scale (the
// chip renders xxs/xxs/xxs/xs/sm text, while inputs render their size's
// textStyle directly — an unmapped `md` input would paint 16px text inside a
// 12px chip).
const inputSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xxs",
  xs: "xxs",
  sm: "xxs",
  md: "xs",
  lg: "sm",
};

// Chip-scale widths for the embedded subtle inputs: the base recipe's
// `--form-min-width: 6rem` is far too wide for an inline segment.
const textInputWidthStyle = css({
  "--form-min-width": "[6ch !important]",
  "--form-width": "[14ch]",
});

const numberInputWidthStyle = css({
  "--form-width": "[8ch]",
});

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
 * outside the control. Operators with `input: null` commit immediately on
 * selection. Escape reverts the draft to the last committed value.
 */
export const Filter = <
  ValueMap extends Record<string, unknown> = Record<string, unknown>,
>(props: {
  className?: string;
  property: string;
  propertyLabel: string;
  operators: ItemOrGroup<FilterOperator<ValueMap>>[];
  value?: FilterValue<ValueMap> | null;
  onChange: (...change: FilterChange<ValueMap>) => void;
  errors?: string[];
  disabled?: boolean;
  testId?: string;
  /** The size (height) of the element */
  size?: FormInputSize;
}) => {
  const {
    className,
    property,
    propertyLabel,
    operators,
    value,
    onChange,
    errors,
    disabled,
    testId,
    size = "md",
  } = props;

  const looseOperators = operators as unknown as Array<
    ItemOrGroup<LooseOperator>
  >;
  const committed = (value ?? null) as CommittedValue;
  const isControlled = value !== undefined;

  const portalContainerRef = usePortalContainerRef();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const dropdownOpenRef = useRef(false);
  const lastEmittedRef = useRef<CommittedValue>(committed);

  const flatOperators = useMemo(
    () => flattenOperators(looseOperators),
    [looseOperators],
  );
  const operatorByKey = (key: string | null | undefined) =>
    key == null
      ? undefined
      : flatOperators.find((operator) => operator.key === key);

  const [draftKey, setDraftKey] = useState<string | null>(
    committed?.key ?? null,
  );
  const [slots, setSlots] = useState<SlotValue[]>(() =>
    slotsForValue(operatorByKey(committed?.key), committed?.value),
  );

  // Adopt external `value` changes (the "adjust state when props change"
  // pattern) without clobbering the draft while the user is editing.
  const [syncedValue, setSyncedValue] = useState<CommittedValue>(committed);
  if (isControlled && !committedEqual(syncedValue, committed)) {
    setSyncedValue(committed);
    setDraftKey(committed?.key ?? null);
    setSlots(slotsForValue(operatorByKey(committed?.key), committed?.value));
  }

  const commitDraft = (key: string | null, draftSlots: SlotValue[]) => {
    if (disabled || key === null) {
      return;
    }
    const operator = operatorByKey(key);
    if (!operator || !isDraftComplete(draftSlots)) {
      return;
    }
    const nextValue = draftValue(operator, draftSlots);
    const reference = isControlled ? committed : lastEmittedRef.current;
    if (committedEqual(reference, { key, value: nextValue })) {
      return;
    }
    lastEmittedRef.current = { key, value: nextValue };
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
      committed && committed.key === nextKey
        ? slotsForValue(operator, committed.value)
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
    const reference = isControlled ? committed : lastEmittedRef.current;
    setDraftKey(reference?.key ?? null);
    setSlots(slotsForValue(operatorByKey(reference?.key), reference?.value));
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<Element>) => {
    if (event.key === "Enter") {
      event.preventDefault();
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
      description: operator.tooltip,
      selectedStyle: "tick",
      subItems: undefined,
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

  const selectedOperator = operatorByKey(draftKey);
  const inputSegments = selectedOperator
    ? inputSegmentsOf(selectedOperator)
    : [];
  const inputCount = inputSegments.filter(
    (segment) => segment.kind === "input",
  ).length;
  const invalid = !!errors && errors.length > 0;
  const classes = filterRecipe({ size, invalid, disabled: !!disabled });

  return (
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
      title={errors && errors.length > 0 ? errors.join("\n") : undefined}
    >
      <ArkSelect.HiddenSelect />
      <span className={classes.property}>{propertyLabel}</span>
      <ArkSelect.Trigger
        className={classes.trigger}
        data-placeholder={selectedOperator ? undefined : ""}
        aria-label={`${propertyLabel} operator`}
      >
        {selectedOperator?.label ?? "…"}
        <Icon name="chevronDown" size={caretSizeMap[size]} />
      </ArkSelect.Trigger>
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
              {segment.text}
            </span>
          );
        }
        const { config, inputIndex } = segment;
        // A separator visually splits its neighbours, so only draw the
        // hairline divider when this input directly follows the trigger or
        // another input.
        const divided = inputSegments[position - 1]?.kind !== "separator";
        const valueLabel = inputCount > 1 ? `value ${inputIndex + 1}` : "value";
        const ariaLabel = `${propertyLabel} ${selectedOperator?.label ?? ""} ${valueLabel}`;
        const assignInputRef = (element: HTMLInputElement | null) => {
          inputRefs.current[inputIndex] = element;
        };
        return (
          <span
            className={classes.inputSlot}
            data-divided={divided ? "" : undefined}
            key={segmentKey}
          >
            {config.type === "string" ? (
              <TextInput
                variant="subtle"
                size={inputSizeMap[size]}
                width="fitContent"
                className={textInputWidthStyle}
                style={
                  config.max !== undefined
                    ? ({
                        "--form-width": `${Math.min(config.max + 2, 24)}ch`,
                      } as React.CSSProperties)
                    : undefined
                }
                value={(slots[inputIndex] as string | null | undefined) ?? ""}
                onChange={(nextValue) => setSlot(inputIndex, nextValue)}
                placeholder={config.placeholder}
                minLength={config.min}
                maxLength={config.max}
                pattern={config.pattern}
                onKeyDown={handleInputKeyDown}
                inputRef={assignInputRef}
                disabled={disabled}
                invalid={invalid}
                aria-label={ariaLabel}
              />
            ) : (
              <NumberInput
                variant="subtle"
                size={inputSizeMap[size]}
                width={config.max !== undefined ? "maxNumber" : "fitContent"}
                className={
                  config.max === undefined ? numberInputWidthStyle : undefined
                }
                hideStepper
                value={(slots[inputIndex] as number | null | undefined) ?? null}
                onChange={(nextValue) => setSlot(inputIndex, nextValue)}
                placeholder={config.placeholder}
                min={config.min}
                max={config.max}
                step={
                  config.type === "int"
                    ? (config.step ?? 1)
                    : (config.step ?? "any")
                }
                onKeyDown={handleInputKeyDown}
                inputRef={assignInputRef}
                disabled={disabled}
                invalid={invalid}
                aria-label={ariaLabel}
              />
            )}
          </span>
        );
      })}
      <Portal container={portalContainerRef}>
        <ArkSelect.Positioner>
          <SelectableList
            as="Select"
            items={menuItems}
            selected={draftKey === null ? [] : [draftKey]}
            size="sm"
            emptyState="No operators available"
          />
        </ArkSelect.Positioner>
      </Portal>
    </ArkSelect.Root>
  );
};
