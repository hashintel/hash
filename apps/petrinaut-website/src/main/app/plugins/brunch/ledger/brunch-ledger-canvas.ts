import {
  namesSelectionItem,
  netElementSelectionItem,
  traceLedger,
  type LedgerState,
  type LedgerTrace,
  type ReflectionRecord,
} from "@hashintel/brunch-agent";

import type { SelectionItem } from "@hashintel/petrinaut-core";

/** The Ledger behind the editor's selection; absent while nothing is selected. */
export const traceCanvasSelection = (
  ledger: LedgerState,
  selection: readonly SelectionItem[],
): LedgerTrace | undefined =>
  selection.length === 0
    ? undefined
    : traceLedger(ledger, {
        netElement: (address) =>
          selection.some((item) => namesSelectionItem(address, item)),
      });

/** Every record address a trace reached, for marking them in the document. */
export const tracedAddresses = (
  trace: LedgerTrace | undefined,
): ReadonlySet<string> =>
  new Set(
    trace === undefined
      ? []
      : [
          ...trace.reflections,
          ...trace.obligations,
          ...trace.claims,
          ...trace.entities,
        ].map(({ address }) => address),
  );

/** The editor items a reflection names, for selecting them on the canvas. */
export const reflectionSelection = (
  reflection: ReflectionRecord,
): SelectionItem[] =>
  (reflection.netElements ?? []).flatMap(
    (address) => netElementSelectionItem(address) ?? [],
  );
