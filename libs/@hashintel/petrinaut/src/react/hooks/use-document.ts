import { useSDCPNState } from "../state/sdcpn-context";

import type { SDCPN } from "@hashintel/petrinaut-core";

/**
 * One part of the document. The reader renders when that part changes.
 * `select` returns a value the document holds, or a primitive: a list or an
 * object it builds is new after every edit.
 *
 * ```tsx
 * const placeCount = usePetrinautDefinitionSelector((net) => net.places.length);
 * ```
 */
export const usePetrinautDefinitionSelector = <Selected>(
  select: (definition: SDCPN) => Selected,
): Selected => useSDCPNState((document) => select(document.petriNetDefinition));

/** The id of the open document, or `null` when none is loaded. */
export const useDocumentId = (): string | null =>
  useSDCPNState((document) => document.petriNetId);
