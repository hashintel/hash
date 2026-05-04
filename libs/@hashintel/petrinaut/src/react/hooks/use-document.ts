import { use, useEffect, useRef } from "react";

import type {
  DocHandleState,
  DocumentId,
  PetrinautPatch,
} from "../../core/handle";
import type { SDCPN } from "../../core/types/sdcpn";
import { SDCPNContext } from "../../state/sdcpn-context";
import { usePetrinautInstance } from "../use-petrinaut-instance";
import { useStore } from "../use-store";

/**
 * The current SDCPN snapshot. Re-renders on every change to the document.
 *
 * For finer-grained re-renders, prefer {@link usePetrinautDefinitionSelector}.
 */
export function usePetrinautDefinition(): SDCPN {
  return use(SDCPNContext).petriNetDefinition;
}

/**
 * Subscribe to a derived slice of the SDCPN. Re-renders only when the selected
 * value changes (`Object.is` comparison).
 */
export function usePetrinautDefinitionSelector<T>(
  selector: (sdcpn: SDCPN) => T,
): T {
  return selector(usePetrinautDefinition());
}

/**
 * Apply a mutation to the document. Reads through the Petrinaut instance
 * (must be inside `<PetrinautInstanceContext>` / `<PetrinautNext>`).
 *
 * Returns a stable function reference for the lifetime of the instance.
 * In read-only mode the call is a no-op.
 */
export function useMutate(): (fn: (draft: SDCPN) => void) => void {
  return usePetrinautInstance().mutate;
}

/** Set the current net's title. */
export function useSetTitle(): (title: string) => void {
  return use(SDCPNContext).setTitle;
}

/** Current net title. */
export function useTitle(): string {
  return use(SDCPNContext).title;
}

/** Stable identifier for the currently loaded net. `null` when none is loaded. */
export function useDocumentId(): DocumentId | null {
  return use(SDCPNContext).petriNetId;
}

/**
 * Lifecycle state of the underlying handle. Today derived from instance
 * presence; once handle.state is exposed end-to-end through the React layer
 * (Phase 3b) this hook will subscribe to it directly.
 */
export function useDocumentState(): DocHandleState {
  const instance = usePetrinautInstance();
  return useStore(instance.handle.state);
}

/** True iff `useDocumentState() === "ready"`. Convenience wrapper. */
export function useIsDocumentReady(): boolean {
  return useDocumentState() === "ready";
}

/**
 * Subscribe to patch events emitted by the document handle. The handler is
 * invoked once per `change()` (skipping no-ops). The returned `void` is
 * intentional — there is no current value, only a stream of events.
 */
export function usePetrinautPatches(
  handler: (patches: PetrinautPatch[]) => void,
): void {
  const instance = usePetrinautInstance();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return instance.patches.subscribe((patches) => {
      handlerRef.current(patches);
    });
  }, [instance]);
}
