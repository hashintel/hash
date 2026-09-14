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

/**
 * Focus a segment on the chip's behalf without surfacing the focus ring:
 * programmatic focus following a click often still matches `:focus-visible`
 * (and text inputs always do), which flashes a keyboard ring the user never
 * asked for. A marker on the chip root blanks `--filter-ring` (see the
 * recipe) until the next real interaction — a key press, pointer press, or
 * focus moving on — each of which lifts it.
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

// ── Abandoned-chip dismissal (removeable.dismissAbandoned) ──────────────────

/** How long an abandoned chip sits untouched before its fade-out begins. */
export const ABANDONED_GRACE_MS = 1000;
/** How long the abandoned fade-out runs before onRemove fires. */
export const ABANDONED_FADE_MS = 2000;

/** How often a held removal re-checks whether the interaction has ended. */
const ABANDONED_HOLD_RECHECK_MS = 250;
/** How long a chip's width-collapse removal runs before onRemove fires. */
export const CHIP_COLLAPSE_MS = 200;

/** Inline style applied to the chip root while the abandoned fade runs. */
export const abandonedFadeStyle: CSSProperties = {
  opacity: 0,
  transition: `opacity ${ABANDONED_FADE_MS}ms ease-out`,
};

export type AbandonmentPhase = "idle" | "fading" | "held" | "collapsing";

/**
 * Whether removing this chip should animate: inside a FilterGroup, removal
 * reflows the sibling chips, so a width collapse keeps the row from
 * snapping; a standalone chip leaves nothing behind to reflow. Reduced
 * motion always removes instantly.
 */
export const shouldAnimateChipRemoval = (root: HTMLElement | null): boolean =>
  !!root?.closest("[data-part=filter-group]") &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Kick off the chip's width collapse: pin the measured width, then
 * transition it to zero over {@link CHIP_COLLAPSE_MS}. Inline styles (not
 * the React style prop) so the measure→transition sequence is not at the
 * mercy of commit timing; pair with {@link clearChipCollapseStyles} if the
 * chip survives (a rescue) rather than unmounting.
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

export const clearChipCollapseStyles = (root: HTMLElement): void => {
  const { style } = root;
  style.removeProperty("width");
  style.removeProperty("min-width");
  style.removeProperty("overflow");
  style.removeProperty("transition");
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
   * the grace timer (an already-running countdown keeps its timing), or —
   * once the fade has completed — retries the held removal.
   */
  evaluate: () => void;
  /** Clear the timers and undo any in-progress fade or held removal. */
  cancel: () => void;
  /** Install the document listeners; returns cleanup that also clears timers. */
  attach: () => () => void;
}

/**
 * Drives the abandoned-chip countdown: once the user focuses or clicks
 * outside the chip while it is eligible, waits {@link ABANDONED_GRACE_MS},
 * fades via `onPhaseChange("fading")`, and after {@link ABANDONED_FADE_MS}
 * removes the chip via `onDismiss`. Dropdowns render in portals, so their
 * interactions land outside the root; while `hasOpenDropdown()` reports one
 * open, no event counts as "outside" — the dropdown's own close hook should
 * call `evaluate` (deferred) afterwards.
 *
 * Removal itself waits for a quiet moment: removing the chip reflows the row,
 * which would shift — or, by unmounting a trigger, close — any open popup the
 * user is interacting with. So while a sibling control's overlay is open
 * within the chip's own scope (its enclosing FilterGroup, or its parent when
 * standalone), or the pointer rests over that scope, the fully faded chip is
 * *held* (`onPhaseChange("held")`): a faint inert placeholder keeping its
 * space (see the `abandonedGhost` recipe class). The dismissal itself
 * collapses the chip's width over {@link CHIP_COLLAPSE_MS}
 * (`onPhaseChange("collapsing")`) before `onDismiss`, so the row closes up
 * smoothly — inside a FilterGroup; a standalone chip (nothing to reflow) is
 * removed instantly (see {@link shouldAnimateChipRemoval}).
 */
export const createAbandonmentController = ({
  isEligible,
  hasOpenDropdown,
  getRoot,
  onPhaseChange,
  onDismiss,
}: {
  /** Whether the chip is currently abandonable (see {@link isAbandonable}). */
  isEligible: () => boolean;
  /** Whether any of the chip's (portaled) dropdowns is open. */
  hasOpenDropdown: () => boolean;
  getRoot: () => HTMLElement | null;
  onPhaseChange: (phase: AbandonmentPhase) => void;
  onDismiss: () => void;
}): AbandonmentController => {
  const timers: {
    grace: number | null;
    fade: number | null;
    collapse: number | null;
  } = {
    grace: null,
    fade: null,
    collapse: null,
  };
  let held = false;
  let holdRecheck: number | null = null;
  // Assigned below — the hold teardown needs a stable listener handle first.
  // Deferred so the overlay/focus fallout of the triggering event settles.
  let finalize: () => void = () => {};
  const deferredFinalize = () => {
    window.setTimeout(() => finalize(), 0);
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
    if (timers.collapse !== null) {
      window.clearTimeout(timers.collapse);
      timers.collapse = null;
    }
  };
  // The collapse animates inline width styles the controller owns (React's
  // style prop never sets them, so they survive re-renders); a cancel mid-way
  // must undo them for the rescued chip to lay out normally again.
  const clearCollapseStyles = () => {
    const root = getRoot();
    if (root) {
      clearChipCollapseStyles(root);
    }
  };
  const stopHold = () => {
    held = false;
    if (holdRecheck !== null) {
      window.clearInterval(holdRecheck);
      holdRecheck = null;
    }
    document.removeEventListener("pointerup", deferredFinalize, true);
    document.removeEventListener("keyup", deferredFinalize, true);
  };
  const cancel = () => {
    clearTimers();
    stopHold();
    clearCollapseStyles();
    onPhaseChange("idle");
  };
  const focusIsInside = () => {
    const active = document.activeElement;
    return !!active && !!getRoot()?.contains(active);
  };
  /**
   * The DOM scope whose interactions removal defers to: the chip's enclosing
   * FilterGroup when it sits in one, otherwise its immediate parent.
   */
  const interactionScope = (): HTMLElement | null => {
    const root = getRoot();
    return (
      root?.closest<HTMLElement>("[data-part=filter-group]") ??
      root?.parentElement ??
      null
    );
  };
  /**
   * Whether removing the chip now would disturb an interaction in progress
   * within its own scope: a sibling control's overlay is open (the portaled
   * content lives outside the scope, but the owning trigger stays inside it,
   * flagged open via data-state/aria-expanded), or the pointer rests over the
   * scope (removal would reflow the row under the cursor).
   */
  const removalBlocked = () => {
    if (hasOpenDropdown()) {
      return true;
    }
    const scope = interactionScope();
    if (!scope) {
      return false;
    }
    return (
      scope.matches(":hover") ||
      scope.querySelector('[data-state="open"], [aria-expanded="true"]') !==
        null
    );
  };

  /**
   * A dismissed chip leaves by collapsing its width (inside a FilterGroup —
   * see {@link shouldAnimateChipRemoval}), so the row closes up smoothly
   * rather than snapping.
   */
  const collapseThenDismiss = () => {
    const root = getRoot();
    if (!root || !shouldAnimateChipRemoval(root)) {
      onDismiss();
      return;
    }
    onPhaseChange("collapsing");
    startChipCollapse(root);
    timers.collapse = window.setTimeout(() => {
      timers.collapse = null;
      clearCollapseStyles();
      onDismiss();
    }, CHIP_COLLAPSE_MS);
  };

  finalize = () => {
    // Rescued while held (e.g. an external value commit): stand down fully.
    if (!isEligible()) {
      cancel();
      return;
    }
    if (timers.collapse !== null) {
      return;
    }
    if (removalBlocked()) {
      if (!held) {
        held = true;
        onPhaseChange("held");
        // Overlays close and hovers end without any single reliable event, so
        // poll cheaply while held, with pointer/key activity as fast paths.
        holdRecheck = window.setInterval(
          deferredFinalize,
          ABANDONED_HOLD_RECHECK_MS,
        );
        document.addEventListener("pointerup", deferredFinalize, true);
        document.addEventListener("keyup", deferredFinalize, true);
      }
      return;
    }
    stopHold();
    collapseThenDismiss();
  };

  const evaluate = () => {
    if (!isEligible() || hasOpenDropdown() || focusIsInside()) {
      cancel();
      return;
    }
    if (held) {
      finalize();
      return;
    }
    // Already counting down (fading or collapsing): keep the original timing.
    if (
      timers.grace !== null ||
      timers.fade !== null ||
      timers.collapse !== null
    ) {
      return;
    }
    timers.grace = window.setTimeout(() => {
      timers.grace = null;
      onPhaseChange("fading");
      timers.fade = window.setTimeout(() => {
        timers.fade = null;
        finalize();
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
      stopHold();
      clearCollapseStyles();
    };
  };

  return { evaluate, cancel, attach };
};
