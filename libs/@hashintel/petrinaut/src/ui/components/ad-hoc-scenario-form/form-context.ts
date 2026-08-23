/**
 * Services the form provides to every value slot beneath it: the LSP session
 * the slots' Monaco documents belong to, and per-slot error lookup joining
 * synthesis errors with LSP diagnostics through `adHocSlotKey`.
 */

import { createContext } from "react";

import type { AdHocSlot } from "@hashintel/petrinaut-core";

export interface AdHocFormServices {
  /** The ad-hoc LSP session id, or empty when no language client is wired. */
  sessionId: string;
  /** The first error attached to a slot: a synthesis error, else an LSP diagnostic. */
  errorFor: (slot: AdHocSlot) => string | undefined;
  /** The Monaco document URI for a slot ("" when no session is wired). */
  uriFor: (slot: AdHocSlot) => string;
}

export const AdHocFormContext = createContext<AdHocFormServices>({
  sessionId: "",
  errorFor: () => undefined,
  uriFor: () => "",
});
