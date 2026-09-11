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
 * Whether any select segment's dropdown is open, derived from the DOM (the
 * segment's trigger carries zag's `data-state`) rather than tracked in a
 * ref: an open select can unmount without ever firing `onOpenChange(false)`
 * — an external value reset, a switch to another operator — which would
 * strand any tracked state as permanently "open".
 */
export const isSelectDropdownOpen = (
  segments: Array<HTMLElement | null>,
): boolean =>
  segments.some(
    (element) =>
      element?.isConnected &&
      element.querySelector("[data-part=trigger][data-state=open]") !== null,
  );

// ── Abandoned-chip dismissal (removeable.dismissAbandoned) ──────────────────

/** How long an abandoned chip sits untouched before its fade-out begins. */
export const ABANDONED_GRACE_MS = 1000;
/** How long the abandoned fade-out runs before onRemove fires. */
export const ABANDONED_FADE_MS = 2000;

/** Inline style applied to the chip root while the abandoned fade runs. */
export const abandonedFadeStyle: CSSProperties = {
  opacity: 0,
  transition: `opacity ${ABANDONED_FADE_MS}ms ease-out`,
};

/**
 * Whether the chip currently counts as abandonable: its draft is incomplete
 * — no operator chosen, or at least one input empty — and rescuable. The
 * committed value is deliberately not consulted: emptying an input of a
 * previously committed chip makes it abandonable again. An operator without
 * inputs has nothing left to fill in, so it is never "abandoned" (its commit
 * is the parent's responsibility); a disabled chip cannot be interacted
 * with, so it is never dismissed out from under the user either.
 */
export const isAbandonable = ({
  dismissAbandoned,
  disabled,
  draftComplete,
  selectedOperator,
}: {
  dismissAbandoned: boolean;
  disabled: boolean;
  /** Operator selected and every input slot filled (see isDraftComplete). */
  draftComplete: boolean;
  selectedOperator: LooseOperator | undefined;
}): boolean =>
  dismissAbandoned &&
  !disabled &&
  !draftComplete &&
  !(
    selectedOperator !== undefined &&
    inputConfigsOf(selectedOperator).length === 0
  );

export interface AbandonmentController {
  /**
   * Re-decide arming from the current facts: cancels when the chip is
   * ineligible, a dropdown is open, or focus sits inside; otherwise starts
   * the grace timer (an already-running countdown keeps its timing).
   */
  evaluate: () => void;
  /** Clear the timers and undo any in-progress fade. */
  cancel: () => void;
  /** Install the document listeners; returns cleanup that also clears timers. */
  attach: () => () => void;
}

/**
 * Drives the abandoned-chip countdown: once the user focuses or clicks
 * outside the chip while it is eligible, waits {@link ABANDONED_GRACE_MS},
 * signals the fade via `onFadeChange(true)`, and after
 * {@link ABANDONED_FADE_MS} calls `onDismiss`. Dropdowns render in portals,
 * so their interactions land outside the root; while `hasOpenDropdown()`
 * reports one open, no event counts as "outside" — the dropdown's own close
 * hook should call `evaluate` (deferred) afterwards.
 */
export const createAbandonmentController = ({
  isEligible,
  hasOpenDropdown,
  getRoot,
  onFadeChange,
  onDismiss,
}: {
  /** Whether the chip is currently abandonable (see {@link isAbandonable}). */
  isEligible: () => boolean;
  /** Whether any of the chip's (portaled) dropdowns is open. */
  hasOpenDropdown: () => boolean;
  getRoot: () => HTMLElement | null;
  onFadeChange: (fading: boolean) => void;
  onDismiss: () => void;
}): AbandonmentController => {
  const timers: { grace: number | null; fade: number | null } = {
    grace: null,
    fade: null,
  };
  const clearTimers = () => {
    if (timers.grace !== null) {
      window.clearTimeout(timers.grace);
      timers.grace = null;
    }
    if (timers.fade !== null) {
      window.clearTimeout(timers.fade);
      timers.fade = null;
    }
  };
  const cancel = () => {
    clearTimers();
    onFadeChange(false);
  };
  const focusIsInside = () => {
    const active = document.activeElement;
    return !!active && !!getRoot()?.contains(active);
  };
  const evaluate = () => {
    if (!isEligible() || hasOpenDropdown() || focusIsInside()) {
      cancel();
      return;
    }
    // Already counting down (or fading): keep the original timing.
    if (timers.grace !== null || timers.fade !== null) {
      return;
    }
    timers.grace = window.setTimeout(() => {
      timers.grace = null;
      onFadeChange(true);
      timers.fade = window.setTimeout(() => {
        timers.fade = null;
        onDismiss();
      }, ABANDONED_FADE_MS);
    }, ABANDONED_GRACE_MS);
  };
  // Deferred so focus (and dropdown open state) settles before deciding.
  const scheduleEvaluate = () => {
    window.setTimeout(evaluate, 0);
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target instanceof Node ? event.target : null;
    if (hasOpenDropdown()) {
      scheduleEvaluate();
      return;
    }
    if (target && getRoot()?.contains(target)) {
      cancel();
      return;
    }
    scheduleEvaluate();
  };
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target instanceof Node ? event.target : null;
    if (target && getRoot()?.contains(target)) {
      cancel();
      return;
    }
    if (hasOpenDropdown()) {
      return;
    }
    scheduleEvaluate();
  };
  const attach = () => {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      clearTimers();
    };
  };

  return { evaluate, cancel, attach };
};
