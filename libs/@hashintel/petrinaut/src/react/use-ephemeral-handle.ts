import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DocChangeEvent,
  DocHandleState,
  PetrinautDocHandle,
  ReadableStore,
} from "../core/handle";
import type { MutateSDCPN, SDCPN } from "../core/types/sdcpn";
import { useLatest } from "../hooks/use-latest";

const READY_STATE_STORE: ReadableStore<DocHandleState> = {
  get: () => "ready",
  subscribe: () => () => {},
};

export type EphemeralHandleProps = {
  petriNetId: string | null;
  petriNetDefinition: SDCPN;
  mutatePetriNetDefinition: MutateSDCPN;
};

/**
 * Adapt prop-driven document state into a {@link PetrinautDocHandle} so the
 * legacy `<Petrinaut>` (which receives `petriNetDefinition` /
 * `mutatePetriNetDefinition` as props rather than owning a handle) can flow
 * through the handle-based pipeline.
 *
 * The returned handle:
 * - emits a `subscribe` event whenever the `petriNetDefinition` prop reference
 *   changes (the parent has produced a new value);
 * - returns the latest prop value from `doc()`;
 * - routes `change()` through the parent-supplied `mutatePetriNetDefinition`;
 * - has no `history` — undo/redo flows through the legacy `UndoRedoContext`
 *   prop, which the adapter wraps around `<PetrinautNext>`.
 *
 * Identity: the handle reference is recreated only when `petriNetId` changes,
 * so downstream `useMemo([handle])` re-runs (e.g. `createPetrinaut`) match the
 * conceptual net switch.
 */
export function useEphemeralHandle({
  petriNetId,
  petriNetDefinition,
  mutatePetriNetDefinition,
}: EphemeralHandleProps): PetrinautDocHandle {
  const definitionRef = useLatest(petriNetDefinition);
  const mutateRef = useLatest(mutatePetriNetDefinition);

  const [listeners] = useState(
    () => new Set<(event: DocChangeEvent) => void>(),
  );

  // Emit a synthetic change event whenever the document prop reference
  // changes. The check guards against React 19 strict-mode double-invocation
  // re-running the effect with the same value.
  const prevDefinitionRef = useRef(petriNetDefinition);
  useEffect(() => {
    if (prevDefinitionRef.current === petriNetDefinition) {
      return;
    }
    prevDefinitionRef.current = petriNetDefinition;
    for (const listener of listeners) {
      listener({
        next: petriNetDefinition,
        source: "local",
      });
    }
  }, [petriNetDefinition, listeners]);

  const id = petriNetId ?? "petrinaut-legacy";

  return useMemo<PetrinautDocHandle>(
    () => ({
      id,
      state: READY_STATE_STORE,
      whenReady: () => Promise.resolve(),
      doc: () => definitionRef.current,
      change: (mutator) => {
        mutateRef.current(mutator);
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    }),
    // definitionRef and mutateRef are stable across renders.
    [id, listeners, definitionRef, mutateRef],
  );
}
