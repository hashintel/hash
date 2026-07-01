import { createContext, useContext } from "react";

/**
 * Which procurement lead-time series drives the *headline* timing everywhere it
 * is recomputed client-side (product card badge, site planning deviation /
 * bad-param counts, and the step slideover's primary distribution):
 *
 *   - "first":    PO date -> first goods receipt.
 *   - "complete": PO date -> last goods receipt (full-receipt / PO-complete).
 *
 * Product/site nodes derive the active basis from combined first/last receipt
 * observations; step details derive both bases by grouping line rows by PO.
 * Every non-procurement step type ignores it. Defaults to "first".
 */
export type ProcurementBasis = "first" | "complete";

export const PROCUREMENT_BASES: readonly ProcurementBasis[] = [
  "first",
  "complete",
];

/** Short label for the toolbar control + tooltips. */
export const PROCUREMENT_BASIS_LABELS: Record<ProcurementBasis, string> = {
  first: "First receipt",
  complete: "Full receipt",
};

interface ProcurementBasisCtx {
  basis: ProcurementBasis;
  setBasis: (basis: ProcurementBasis) => void;
}

export const ProcurementBasisContext = createContext<ProcurementBasisCtx>({
  basis: "first",
  setBasis: () => {},
});

export function useProcurementBasis() {
  return useContext(ProcurementBasisContext);
}
