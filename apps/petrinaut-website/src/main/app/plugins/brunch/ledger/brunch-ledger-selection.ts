import {
  namesId,
  storedNetElementId,
  traceLedger,
  type LedgerState,
  type LedgerTrace,
  type NetElementAddress,
  type ReflectionRecord,
} from "@hashintel/brunch-agent";
import {
  selectionItemTypes,
  type SelectionItem,
  type SelectionItemType,
} from "@hashintel/petrinaut-core/selection";

const selectable: ReadonlySet<string> = new Set(selectionItemTypes);

const isSelectionItemType = (kind: string): kind is SelectionItemType =>
  selectable.has(kind);

/**
 * The editor selection a net element address stands for, with its ID as the
 * document stores it; absent for kinds the editor cannot select.
 */
export const netElementSelectionItem = (
  address: NetElementAddress,
): SelectionItem | undefined =>
  isSelectionItemType(address.kind)
    ? { type: address.kind, id: storedNetElementId(address) }
    : undefined;

/** Whether a net element address names a selected editor item. */
export const namesSelectionItem = (
  address: NetElementAddress,
  item: SelectionItem,
): boolean => address.kind === item.type && namesId(address.id, item.id);

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
