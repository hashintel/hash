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

import type { AdHocHighlight } from "./dependency-highlight";
import type {
  AdHocScenarioState,
  AdHocSlot,
  AdHocSynthesisContext,
  AdHocValueTarget,
} from "@hashintel/petrinaut-core";

export interface AdHocFormServices {
  /** The whole form state, as currently edited. */
  formState: AdHocScenarioState;
  /** The net the form resolves names and types against. */
  synthesisContext: AdHocSynthesisContext;
  /** Whether Optimize controls exist at all in this consumer. */
  optimizable: boolean;
  /** The ad-hoc LSP session id, or empty when no language client is wired. */
  sessionId: string;
  /** The first error attached to a slot: a synthesis error, else an LSP diagnostic. */
  errorFor: (slot: AdHocSlot) => string | undefined;
  /** The Monaco document URI for a slot ("" when no session is wired). */
  uriFor: (slot: AdHocSlot) => string;
  /** The rows and cells connected to the focused value. */
  highlight: AdHocHighlight;
  /** Reports which value holds focus, driving the dependency highlight. */
  setFocusedValue: (target: AdHocValueTarget | null) => void;
}

export const AdHocFormContext = createContext<AdHocFormServices>({
  formState: { variables: [], netParameters: [], places: {} },
  synthesisContext: { netParameters: [], places: [], types: [] },
  optimizable: false,
  sessionId: "",
  errorFor: () => undefined,
  uriFor: () => "",
  highlight: EMPTY_AD_HOC_HIGHLIGHT,
  setFocusedValue: () => {},
});
