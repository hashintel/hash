/**
 * Everything the form provides to the slots beneath it, so per-slot
 * components carry only their own value and location:
 *
 * - the net context, and the attribution labels and place totals read
 *   from the whole form state;
 * - what the selection toggle means in this consumer, if it exists at all;
 * - the Monaco document of each slot in the form's LSP session;
 * - per-slot error lookup, joining synthesis errors with LSP diagnostics
 *   through `adHocSlotKey`.
 */

import { createContext, use } from "react";

import { useStoreSelector } from "../../../react/use-store";

import type { AdHocFocusTarget, AdHocHighlight } from "./dependency-highlight";
import type {
  AdHocAction,
  AdHocPlaceTotal,
  AdHocScenarioState,
  AdHocSlot,
  AdHocSynthesisContext,
  AdHocValueTarget,
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
 * What the form knows that changes while it is used: the definition, and
 * what the form derives from it, from the language service and from the
 * focused value. A component reads the part it shows with
 * {@link useAdHocFormFact}, so an edit renders the cells it changes and no
 * other.
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

/**
 * What the form gives the components beneath it and keeps for its whole
 * life: none of it changes with an edit, a diagnostic or a move of the
 * focus, so reading it renders nothing.
 */
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
 * One part of what the form knows. The caller renders when that part
 * changes, and not for the rest of an edit.
 *
 * `select` picks a value that stays the same while it says the same: a
 * string, a boolean, or an object the definition holds. For a part built in
 * `select`, pass `isSame`.
 */
export const useAdHocFormFact = <Selected>(
  select: (facts: AdHocFormFacts) => Selected,
  isSame?: (previous: Selected, next: Selected) => boolean,
): Selected => {
  const { facts } = useAdHocForm();
  return useStoreSelector(facts, select, isSame);
};

/** Whether two flat records of strings, numbers and booleans say the same. */
export const sameFlatFacts = <Facts extends Record<string, unknown>>(
  previous: Facts,
  next: Facts,
): boolean => {
  const keys = Object.keys(next);
  return (
    keys.length === Object.keys(previous).length &&
    keys.every((key) => previous[key] === next[key])
  );
};
