import { createContext } from "react";

import { type ItemOrGroup } from "../../util/SelectableList/selectable-list";

import type { IconName } from "../Icon/icon";
import type {
  MultiSelectItem,
  SelectItem,
  SelectProps,
} from "../Select/select";
import type { CSSProperties } from "react";

export type InputSeparator = string | { iconName: IconName };

type TextInput = {
  type: "string";
  placeholder?: string;
  min?: number;
  max?: number;
  pattern?: string;
};

type NumberInput = {
  type: "number" | "int" | "float";
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
};

/** Items may be provided upfront, or lazily via an async loader. */
type SelectInputItems<Item> =
  | ReadonlyArray<ItemOrGroup<Item>>
  | (() => Promise<ReadonlyArray<ItemOrGroup<Item>>>);

export type SingleSelectInput<TValue extends string = string> = {
  type: "select";
  items: SelectInputItems<SelectItem<TValue>>;
  renderItem?: (value: TValue) => React.ReactNode;
  renderSelectedItem?: (value: TValue) => React.ReactNode;
  emptyState?: React.ReactNode;
  placeholder?: string;
  multiple?: false;
  searchable?:
    | boolean
    | {
        onSearch?: (search: string) => void;
      };
};

export type MultiSelectInput<TValue extends string = string> = {
  type: "select";
  items: SelectInputItems<MultiSelectItem<TValue>>;
  renderItem?: (value: TValue) => React.ReactNode;
  renderSelectedItem?: (values: TValue[]) => React.ReactNode;
  emptyState?: React.ReactNode;
  placeholder?: string;
  multiple: true;
  maxItems?: number;
  overflow?: Extract<SelectProps, { multiple: true }>["overflow"];
  searchable?:
    | boolean
    | {
        onSearch?: (search: string) => void;
        hideCount?: boolean;
        hideSelectAllToggle?: boolean;
      };
};

export type Input =
  | TextInput
  | NumberInput
  | SingleSelectInput
  | MultiSelectInput;

/**
 * The input config an operator must declare for its value type in the
 * ValueMap: string → a text input or a single select, number → a number
 * input, a non-tuple array of strings → a multi select, a tuple → a tuple
 * of inputs mapped element-wise (`[string, number]` → a text/select input
 * then a number input), null → no input. Unknown value types accept any
 * input shape.
 */
export type InputFor<Value> = [Value] extends [null]
  ? null
  : [Value] extends [string]
    ? TextInput | SingleSelectInput<Value>
    : [Value] extends [number]
      ? NumberInput
      : [Value] extends [infer Values extends ReadonlyArray<string>]
        ? number extends Values["length"]
          ? MultiSelectInput<Values[number]>
          : InputArrayFor<Values>
        : [Value] extends [infer Tuple extends ReadonlyArray<unknown>]
          ? InputArrayFor<Tuple>
          : Input | ReadonlyArray<Input | InputSeparator> | null;

/**
 * Tuple of inputs matching a value tuple element-wise, optionally with a
 * static string segment (rendered as separator text, e.g. "-") between
 * consecutive inputs. Separators carry no value, so they may only appear
 * between inputs — never leading or trailing.
 */
type InputArrayFor<Value extends ReadonlyArray<unknown>> =
  Value extends readonly [
    infer Head,
    ...infer Rest extends ReadonlyArray<unknown>,
  ]
    ? Rest extends readonly []
      ? readonly [InputFor<Head>]
      : readonly [
          InputFor<Head>,
          ...([] | [InputSeparator]),
          ...InputArrayFor<Rest>,
        ]
    : readonly [];

export type FilterValue<ValueMap extends Record<string, unknown>> = {
  [Key in keyof ValueMap & string]: { key: Key; value: ValueMap[Key] | null };
}[keyof ValueMap & string];

/**
 * Discriminated (key, value) argument pairs for the Filter-level `onChange`
 * — checking `key` in the handler narrows `value` to that operator's type.
 * The key is always a concrete operator key: clearing the inputs fires
 * `(key, null)`, and removal is signalled via `removeable.onRemove` instead.
 */
export type FilterChange<ValueMap extends Record<string, unknown>> = {
  [Key in keyof ValueMap & string]: [key: Key, value: ValueMap[Key] | null];
}[keyof ValueMap & string];

/**
 * The ValueMap machinery above types the consumer surface; internally the
 * component works against this untyped shape and casts at the boundary.
 */
export type LooseFieldConfig = {
  type: "string" | "number" | "int" | "float";
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
};

export type LooseSelectConfig = SingleSelectInput | MultiSelectInput;

type LooseInputConfig = LooseFieldConfig | LooseSelectConfig;

export type LooseOperator = {
  key: string;
  label: string;
  input:
    | LooseInputConfig
    | ReadonlyArray<LooseInputConfig | InputSeparator>
    | null;
  onChange?: (value: unknown) => void;
};

/** A multi select's slot holds its full array of selected values. */
export type SlotValue = string | number | string[] | null;
export type CommittedValue = { key: string; value: unknown } | null;

/**
 * One rendered segment of an operator's input area. Separator entries in an
 * input array (static text such as "-", or an icon) carry no value, so
 * slots/values are indexed by `inputIndex`, which counts only the actual
 * inputs.
 */
type InputSegment =
  | { kind: "input"; config: LooseInputConfig; inputIndex: number }
  | { kind: "separator"; separator: InputSeparator };

export const inputSegmentsOf = (operator: LooseOperator): InputSegment[] => {
  const { input } = operator;
  if (input === null) {
    return [];
  }
  // `in` narrowing sidesteps Array.isArray's `any[]` narrowing of ReadonlyArray
  const entries = "type" in input ? [input] : input;
  const segments: InputSegment[] = [];
  let inputIndex = 0;
  for (const entry of entries) {
    if (typeof entry === "string" || "iconName" in entry) {
      segments.push({ kind: "separator", separator: entry });
    } else {
      segments.push({ kind: "input", config: entry, inputIndex });
      inputIndex += 1;
    }
  }
  return segments;
};

export const inputConfigsOf = (
  operator: LooseOperator,
): ReadonlyArray<LooseInputConfig> =>
  inputSegmentsOf(operator)
    .filter((segment) => segment.kind === "input")
    .map((segment) => segment.config);

export const flattenOperators = (
  operators: ReadonlyArray<ItemOrGroup<LooseOperator>>,
): LooseOperator[] =>
  operators.flatMap((entry) => ("items" in entry ? entry.items : [entry]));

export const slotsForValue = (
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
  // Only a tuple of inputs maps an array value element-wise — for a single
  // input (a multi select) the whole array is that one input's slot.
  if (Array.isArray(operator.input) && Array.isArray(committed)) {
    return configs.map((_, index) => (committed[index] as SlotValue) ?? null);
  }
  return configs.map((_, index) =>
    index === 0 ? (committed as SlotValue) : null,
  );
};

const isEmptySlot = (slot: SlotValue) =>
  Array.isArray(slot) ? slot.length === 0 : slot === null || slot === "";

export const isDraftComplete = (slots: SlotValue[]) =>
  slots.every((slot) => !isEmptySlot(slot));

export const isDraftCleared = (slots: SlotValue[]) => slots.every(isEmptySlot);

export const draftValue = (
  operator: LooseOperator,
  slots: SlotValue[],
): unknown => {
  if (operator.input === null) {
    return null;
  }
  return Array.isArray(operator.input) ? [...slots] : (slots[0] ?? null);
};

// Recurses so tuples containing multi-select (array) values compare deeply.
const scalarOrTupleEqual = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length &&
      a.every((entry, index) => scalarOrTupleEqual(entry, b[index]))
    : a === b;

export const committedEqual = (a: CommittedValue, b: CommittedValue): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.key === b.key &&
    scalarOrTupleEqual(a.value, b.value));

export const numberStepOf = (config: LooseFieldConfig): number | "any" =>
  config.type === "int" ? (config.step ?? 1) : (config.step ?? "any");

export const isIntegerConfig = (config: LooseFieldConfig): boolean => {
  const step = numberStepOf(config);
  return step !== "any" && Number.isInteger(step);
};

/**
 * Number slots hold the raw input string while the user edits, so
 * intermediate states like "-" and "1." survive the controlled round-trip.
 * This resolves those strings to numbers for completeness checks and
 * committing; unparseable remnants (e.g. a lone "-") become null, i.e. an
 * empty slot.
 */
export const normalizeSlots = (
  operator: LooseOperator,
  slots: SlotValue[],
): SlotValue[] =>
  inputConfigsOf(operator).map((config, index) => {
    const slot = slots[index] ?? null;
    if (
      config.type === "string" ||
      config.type === "select" ||
      typeof slot !== "string"
    ) {
      return slot;
    }
    const parsed = isIntegerConfig(config)
      ? Math.trunc(parseInt(slot, 10))
      : parseFloat(slot);
    return Number.isNaN(parsed) ? null : parsed;
  });

/**
 * Derived from the DOM (the segment's trigger carries zag's `data-state`) rather than tracked in a
 * ref: an open select can unmount without ever firing `onOpenChange(false)`
 */
export const isSelectDropdownOpen = (
  segments: Array<HTMLElement | null>,
): boolean =>
  segments.some(
    (element) =>
      element?.isConnected &&
      element.querySelector("[data-part=trigger][data-state=open]") !== null,
  );

/**
 * Focus a segment on the chip's behalf without surfacing the focus ring:
 * programmatic focus following a click often still matches `:focus-visible`,
 * which flashes a keyboard ring the user never asked for. A marker on
 * the chip root blanks `--filter-ring` until the next real interaction.
 */
export const focusWithoutRing = (
  chipRoot: HTMLElement,
  target: HTMLElement,
): void => {
  chipRoot.setAttribute("data-focus-ring-suppressed", "");
  const lift = () => {
    chipRoot.removeAttribute("data-focus-ring-suppressed");
    document.removeEventListener("keydown", lift, true);
    document.removeEventListener("pointerdown", lift, true);
    chipRoot.removeEventListener("focusout", lift, true);
  };
  document.addEventListener("keydown", lift, true);
  document.addEventListener("pointerdown", lift, true);
  chipRoot.addEventListener("focusout", lift, true);
  target.focus();
};

/** How long the group sits untouched before abandoned chips start fading. */
export const ABANDONED_GRACE_MS = 1000;
export const ABANDONED_FADE_MS = 2000;
/** How long a chip's width-collapse removal runs before onRemove fires. */
export const CHIP_COLLAPSE_MS = 200;

/** Inline style applied to an abandoned chip's root while the fade runs. */
export const abandonedFadeStyle: CSSProperties = {
  opacity: 0,
  transition: `opacity ${ABANDONED_FADE_MS}ms ease-out`,
};

export const shouldAnimateChipRemoval = (root: HTMLElement | null): boolean =>
  !!root?.closest("[data-part=filter-group]") &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Kick off the chip's width collapse: pin the measured width, then
 * transition it to zero over.
 */
export const startChipCollapse = (root: HTMLElement): void => {
  const { style } = root;
  style.width = `${root.getBoundingClientRect().width}px`;
  style.minWidth = "0";
  style.overflow = "hidden";
  // Commit the start width before the transition targets zero.
  root.getBoundingClientRect();
  style.transition = `width ${CHIP_COLLAPSE_MS}ms ease`;
  style.width = "0px";
};

/**
 * Whether the chip currently counts as abandonable: it is removeable and its
 * draft is incomplete — no operator chosen, or at least one input empty. The
 * committed value is deliberately not consulted: emptying an input of a
 * previously committed chip makes it abandonable again.
 * */
export const isAbandonable = ({
  removeable,
  disabled,
  draftComplete,
  selectedOperator,
}: {
  removeable: boolean;
  disabled: boolean;
  /** Operator selected and every input slot filled (see isDraftComplete). */
  draftComplete: boolean;
  selectedOperator: LooseOperator | undefined;
}): boolean =>
  removeable &&
  !disabled &&
  !draftComplete &&
  !(
    selectedOperator !== undefined &&
    inputConfigsOf(selectedOperator).length === 0
  );

export interface AbandonableChip {
  isAbandonable: () => boolean;
  dismiss: () => void;
}

export interface FilterGroupAbandonment {
  fading: boolean;
  register: (chip: AbandonableChip) => () => void;
}

export const FilterGroupAbandonmentContext =
  createContext<FilterGroupAbandonment | null>(null);

/**
 * Drives a FilterGroup's abandoned-chip countdown: once the user focuses or
 * clicks outside the group while a member chip is abandonable, waits, then fades
 * out any chips with empty input.
 */
export const attachAbandonmentController = ({
  getRoot,
  getChips,
  onFadingChange,
}: {
  getRoot: () => HTMLElement | null;
  getChips: () => Iterable<AbandonableChip>;
  onFadingChange: (fading: boolean) => void;
}): (() => void) => {
  let graceTimer: number | null = null;
  let fadeTimer: number | null = null;

  const cancel = () => {
    if (graceTimer !== null) {
      window.clearTimeout(graceTimer);
      graceTimer = null;
    }
    if (fadeTimer !== null) {
      window.clearTimeout(fadeTimer);
      fadeTimer = null;
    }
    onFadingChange(false);
  };

  const isInside = () => {
    const root = getRoot();
    if (!root) {
      // Not mounted: nothing can be dismissed, so treat as inside (cancels).
      return true;
    }
    const active = document.activeElement;
    return (
      (!!active && root.contains(active)) ||
      root.querySelector('[data-state="open"], [aria-expanded="true"]') !== null
    );
  };
  const anyAbandonable = () => {
    for (const chip of getChips()) {
      if (chip.isAbandonable()) {
        return true;
      }
    }
    return false;
  };

  const evaluate = () => {
    if (isInside() || !anyAbandonable()) {
      cancel();
      return;
    }
    // Already counting down: keep the original timing.
    if (graceTimer !== null || fadeTimer !== null) {
      return;
    }
    graceTimer = window.setTimeout(() => {
      graceTimer = null;
      onFadingChange(true);
      fadeTimer = window.setTimeout(() => {
        fadeTimer = null;
        for (const chip of getChips()) {
          chip.dismiss();
        }
        onFadingChange(false);
      }, ABANDONED_FADE_MS);
    }, ABANDONED_GRACE_MS);
  };
  // Deferred so the event's fallout (focus moving, a dropdown closing on an
  // outside click) settles before deciding.
  const scheduleEvaluate = () => {
    window.setTimeout(evaluate, 0);
  };

  const onInteraction = (event: Event) => {
    const target = event.target instanceof Node ? event.target : null;
    if (target && getRoot()?.contains(target)) {
      cancel();
      return;
    }
    scheduleEvaluate();
  };

  document.addEventListener("pointerdown", onInteraction, true);
  document.addEventListener("focusin", onInteraction, true);
  return () => {
    document.removeEventListener("pointerdown", onInteraction, true);
    document.removeEventListener("focusin", onInteraction, true);
    cancel();
  };
};
