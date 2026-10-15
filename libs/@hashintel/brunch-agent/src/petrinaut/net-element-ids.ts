import { canonicalizeArcId, toPetrinautId } from "@hashintel/petrinaut-core";
import {
  selectionItemTypes,
  type SelectionItem,
  type SelectionItemType,
} from "@hashintel/petrinaut-core/selection";

import type { NetElementAddress } from "../ledger/construction/reflections";

/**
 * Whether `written` names `id`: as written, or as the converted id the
 * document stores for an id the model invented. Flue keeps the model's raw
 * arguments, while ids read from the document are converted.
 */
export const namesId = (written: unknown, id: string): boolean =>
  typeof written === "string" &&
  (written === id ||
    toPetrinautId(written) === id ||
    canonicalizeArcId(written) === id);

const selectable: ReadonlySet<string> = new Set(selectionItemTypes);

const isSelectionItemType = (kind: string): kind is SelectionItemType =>
  selectable.has(kind);

/**
 * The editor selection a net element address stands for, with its ID as the
 * document stores it; absent for kinds the editor cannot select.
 */
export const netElementSelectionItem = ({
  kind,
  id,
}: NetElementAddress): SelectionItem | undefined =>
  isSelectionItemType(kind)
    ? {
        type: kind,
        id: kind === "arc" ? canonicalizeArcId(id) : toPetrinautId(id),
      }
    : undefined;

/** Whether a net element address names a selected editor item. */
export const namesSelectionItem = (
  address: NetElementAddress,
  item: SelectionItem,
): boolean => address.kind === item.type && namesId(address.id, item.id);
