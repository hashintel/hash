/**
 * Everything the form provides to the slots beneath it, so per-slot
 * components carry only their own value and location:
 *
 * - the whole form state and the net context, for attribution labels and
 *   place totals;
 * - whether Optimize controls exist at all in this consumer;
 * - the LSP session the slots' Monaco documents belong to;
 * - per-slot error lookup, joining synthesis errors with LSP diagnostics
 *   through `adHocSlotKey`.
 */

import { createContext } from "react";

import { EMPTY_AD_HOC_HIGHLIGHT } from "./dependency-highlight";

import type { AdHocFocusTarget, AdHocHighlight } from "./dependency-highlight";
import type {
  AdHocAction,
  AdHocScenarioState,
  AdHocSlot,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

/**
 * What selecting a value means in this consumer: nothing, marking a value
 * for the optimizer (with bounds), or exposing a top-level Variable as a
 * scenario parameter the saved scenario's users can tune.
 */
export type AdHocFormSelection = "none" | "optimize" | "expose";

/** The visible name of the selection toggle. */
export const adHocSelectionText = (selection: AdHocFormSelection): string =>
  selection === "expose" ? "Scenario Parameter" : "Optimize";

/**
 * What the form lets the user change. "author" is the full editor. "run"
 * shows a saved scenario for a run: only the exposed top-level Variables
 * (the scenario's parameters) accept value edits; auxiliary Variables are
 * hidden, and everything else is read-only yet stays keyboard-navigable
 * and selectable.
 */
export type AdHocFormMode = "author" | "run";

export interface AdHocFormServices {
  /** What the form lets the user change; see {@link AdHocFormMode}. */
  mode: AdHocFormMode;
  /** The whole form state, as currently edited. */
  formState: AdHocScenarioState;
  /**
   * The one write path: every edit is a serializable action applied by the
   * pure reducer in petrinaut-core and recorded as an undo step.
   */
  dispatch: (action: AdHocAction) => void;
  /** The net the form resolves names and types against. */
  synthesisContext: AdHocSynthesisContext;
  /** What selecting a value means here; "none" hides the toggles. */
  selection: AdHocFormSelection;
  /** The ad-hoc LSP session id, or empty when no language client is wired. */
  sessionId: string;
  /** The first error attached to a slot: a synthesis error, else an LSP diagnostic. */
  errorFor: (slot: AdHocSlot) => string | undefined;
  /** The Monaco document URI for a slot ("" when no session is wired). */
  uriFor: (slot: AdHocSlot) => string;
  /** The rows and cells connected to the focused value. */
  highlight: AdHocHighlight;
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

export const AdHocFormContext = createContext<AdHocFormServices>({
  mode: "author",
  formState: { variables: [], netParameters: [], places: {} },
  dispatch: () => {},
  synthesisContext: { netParameters: [], places: [], types: [] },
  selection: "none",
  sessionId: "",
  errorFor: () => undefined,
  uriFor: () => "",
  highlight: EMPTY_AD_HOC_HIGHLIGHT,
  setFocusedValue: () => {},
  formatExpression: () => Promise.resolve(null),
  dense: false,
  overlayKeyDown: { capture: () => {}, bubble: () => {} },
});
