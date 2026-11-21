/**
 * What the form gives the components beneath it, so each carries only its
 * own value and location. It comes in two parts:
 *
 * - {@link AdHocFormServices}, through the context: what an edit, a
 *   diagnostic or a move of the focus leaves as it is (the write path, the
 *   net, the mode). Reading it with {@link useAdHocForm} renders nothing
 *   while the form is used.
 * - {@link AdHocFormFacts}, through a store the context holds: what those
 *   three change (the definition, the errors, the labels, the totals, the
 *   highlight). A component reads its own part with
 *   {@link useAdHocFormFact} and renders when that part changes, so an edit
 *   renders the cells it changes and no other.
 */

import { createContext, use } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

import { adHocVariableKey } from "./dependency-highlight";

import type { AdHocFocusTarget, AdHocHighlight } from "./dependency-highlight";
import type {
  AdHocAction,
  AdHocPlaceTotal,
  AdHocScenarioState,
  AdHocSlot,
  AdHocSynthesisContext,
  AdHocValueTarget,
  AdHocVariable,
  ReadableStore,
} from "@hashintel/petrinaut-core";

/**
 * What selecting a value means in this consumer: nothing; marking a numeric
 * value's interval for an experiment — the toggle reads "Optimize" when the
 * in-browser optimizer will search it, "Sweep" when the sweep waits for a
 * selection (Min and Max, nothing else); or exposing a top-level Variable as
 * a scenario parameter the saved scenario's users can tune.
 */
export type AdHocFormSelection = "none" | "optimize" | "sweep" | "expose";

/** The visible name of the selection toggle. */
export const adHocSelectionText = (selection: AdHocFormSelection): string => {
  switch (selection) {
    case "expose":
      return "Scenario Parameter";
    case "sweep":
      return "Sweep";
    default:
      return "Optimize";
  }
};

/** Whether the selection marks an interval on a value slot ("optimize" or "sweep"). */
export const adHocIntervalSelection = (
  selection: AdHocFormSelection,
): selection is "optimize" | "sweep" =>
  selection === "optimize" || selection === "sweep";

/**
 * Whether a value of this domain can carry a selection in this consumer. An
 * interval needs a number: real, integer, ratio or count. Text and boolean
 * values never carry one: synthesis reports them at the slot when a stale
 * toggle is on.
 */
export const adHocSelectionApplies = (
  selection: AdHocFormSelection,
  kind: "real" | "integer" | "boolean" | "ratio" | "string" | "uuid" | "count",
): boolean =>
  adHocIntervalSelection(selection) &&
  (kind === "real" ||
    kind === "integer" ||
    kind === "ratio" ||
    kind === "count");

/**
 * What the form lets the user change. "author" is the full editor. "run"
 * shows a saved scenario for a run: only the exposed top-level Variables
 * (the scenario's parameters) accept value edits; auxiliary Variables are
 * hidden, and everything else is read-only yet stays keyboard-navigable
 * and selectable.
 */
export type AdHocFormMode = "author" | "run";

/**
 * What changes while the form is used: the definition, and what the form
 * derives from it, from the language service and from the focused value.
 */
export interface AdHocFormFacts {
  /** The definition the form shows. */
  state: AdHocScenarioState;
  /** The first error attached to a slot: a synthesis error, else an LSP diagnostic. */
  errorFor: (slot: AdHocSlot) => string | undefined;
  /**
   * The user-facing path of a value (`Space › item 0 › x`), from an index
   * the form builds once per definition rather than per slot.
   */
  labelFor: (target: AdHocValueTarget) => string;
  /**
   * A place's token total, from one normalization of the whole state per
   * definition rather than one per place.
   */
  placeTotal: (placeId: string) => AdHocPlaceTotal;
  /** The rows and cells connected to the focused value. */
  highlight: AdHocHighlight;
  /**
   * The expression a read-only value was computed from, where the host
   * knows one. A fact because a host may pass a new function on any render.
   */
  expressionFor: (target: AdHocValueTarget) => string | undefined;
}

/** What an edit, a diagnostic or a move of the focus leaves as it is. */
export interface AdHocFormServices {
  /** What the form lets the user change; see {@link AdHocFormMode}. */
  mode: AdHocFormMode;
  /**
   * The one write path: every edit is a serializable action applied by the
   * pure reducer in petrinaut-core and recorded as an undo step. A batch of
   * actions applies in order and records one step.
   */
  dispatch: (action: AdHocAction | AdHocAction[]) => void;
  /** The net the form resolves names and types against. */
  synthesisContext: AdHocSynthesisContext;
  /** What selecting a value means here; "none" hides the toggles. */
  selection: AdHocFormSelection;
  /** The Monaco document URI for a slot ("" when no session is wired). */
  uriFor: (slot: AdHocSlot) => string;
  /** What changes while the form is used; read with {@link useAdHocFormFact}. */
  facts: ReadableStore<AdHocFormFacts>;
  /** Reports which value or row holds focus, driving the highlight. */
  setFocusedValue: React.Dispatch<
    React.SetStateAction<AdHocFocusTarget | null>
  >;
  /**
   * Re-prints a valid expression canonically (via the language worker).
   * Resolves null when the code does not lower — the text stays untouched.
   */
  formatExpression: (code: string) => Promise<string | null>;
  /**
   * The embedded rendering (a host-driven `renderLayout`): smaller place
   * titles, tighter spacing — for hosts that show the form inside an
   * already-dense panel.
   */
  dense: boolean;
  /**
   * The form root's key guards, re-attached by content that portals
   * outside the root (the value-editor slab): `capture` is the undo/redo
   * capture, `bubble` stops Delete/Backspace from reaching host shortcuts.
   * Without them, keys pressed on the slab's non-Monaco controls would
   * bypass form undo and hit the canvas.
   */
  overlayKeyDown: {
    capture: (event: React.KeyboardEvent) => void;
    bubble: (event: React.KeyboardEvent) => void;
  };
}

export const AdHocFormContext = createContext<AdHocFormServices | null>(null);

/** The services of the form the caller renders in. */
export const useAdHocForm = (): AdHocFormServices => {
  const services = use(AdHocFormContext);
  if (!services) {
    throw new Error("useAdHocForm must be called inside AdHocScenarioForm");
  }
  return services;
};

/**
 * One part of the form's facts. The caller renders when that part changes.
 *
 * `select` picks a value that stays the same while it says the same: a
 * string, a boolean, or an object the definition holds. For a list or a
 * record built in `select`, pass {@link sameParts}.
 */
export const useAdHocFormFact = <Selected>(
  select: (facts: AdHocFormFacts) => Selected,
  isSame?: (previous: Selected, next: Selected) => boolean,
): Selected => {
  const { facts } = useAdHocForm();
  return useSyncExternalStoreWithSelector(
    (onStoreChange) => facts.subscribe(onStoreChange),
    () => facts.get(),
    // The same value where a component is rendered to a string.
    () => facts.get(),
    select,
    isSame,
  );
};

/**
 * Whether two lists, or two records, hold the same values: the equality of
 * a fact that a selector builds from values that keep their identity.
 */
export const sameParts = <Parts extends object>(
  previous: Parts,
  next: Parts,
): boolean => {
  const keys = Object.keys(next) as (keyof Parts)[];
  return (
    keys.length === Object.keys(previous).length &&
    keys.every((key) => previous[key] === next[key])
  );
};

const noVariables: AdHocVariable[] = [];

/** The Variables of a scope: the form's own (`null`), or a coloured place's. */
export const variablesOf = (
  facts: AdHocFormFacts,
  placeId: string | null,
): AdHocVariable[] => {
  if (placeId === null) {
    return facts.state.variables;
  }
  const place = facts.state.places[placeId];
  return place?.kind === "coloured" ? place.variables : noVariables;
};

/** Per Variable of a scope: whether the focused value reads it. */
export const variableHighlights = (
  facts: AdHocFormFacts,
  placeId: string | null,
): boolean[] =>
  variablesOf(facts, placeId).map((variable) =>
    facts.highlight.variableKeys.has(adHocVariableKey(placeId, variable.name)),
  );

/** Per Variable of a scope: the error of its name, if it has one. */
export const variableNameErrors = (
  facts: AdHocFormFacts,
  placeId: string | null,
): (string | undefined)[] =>
  variablesOf(facts, placeId).map((_, index) =>
    facts.errorFor({
      target: { kind: "variable", placeId, index },
      part: "name",
    }),
  );
