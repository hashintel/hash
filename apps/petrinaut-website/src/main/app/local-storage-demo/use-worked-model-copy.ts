import { useCallback, useEffect, useRef, useState } from "react";

import {
  createCleanWorkedModelCopy,
  resolveWorkedModelCopy,
  updateWorkedModelDefinition,
  type WorkedModelCopy,
} from "./worked-model-client";

import type { DocumentRevisionId, SDCPN } from "@hashintel/petrinaut-core";

interface WorkedModelCopyState {
  readonly copy: WorkedModelCopy | null;
  readonly error: Error | null;
  readonly loading: boolean;
}

const initialState: WorkedModelCopyState = {
  copy: null,
  error: null,
  loading: false,
};

export const useWorkedModelCopy = (input: {
  readonly bundleKey: string | undefined;
  readonly chatEndpoint: string;
  readonly currentOrigin: string;
  readonly enabled: boolean;
  readonly principalKey: string;
}) => {
  const [state, setState] = useState<WorkedModelCopyState>(initialState);
  const copyRef = useRef<WorkedModelCopy | null>(null);
  const selectionGenerationRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const writeBasesRef = useRef(new Map<string, WorkedModelCopy>());
  const writesByRevisionRef = useRef(
    new Map<DocumentRevisionId, Promise<void>>(),
  );

  const acceptCopy = useCallback((copy: WorkedModelCopy) => {
    copyRef.current = copy;
    writeBasesRef.current.set(copy.copyId, copy);
    setState({ copy, error: null, loading: false });
  }, []);

  useEffect(() => {
    const selectionGeneration = selectionGenerationRef.current + 1;
    selectionGenerationRef.current = selectionGeneration;
    copyRef.current = null;
    writeQueueRef.current = Promise.resolve();
    if (!input.enabled || input.bundleKey === undefined) {
      setState(initialState);
      return;
    }
    let current = true;
    setState({ copy: null, error: null, loading: true });
    void resolveWorkedModelCopy({
      chatEndpoint: input.chatEndpoint,
      currentOrigin: input.currentOrigin,
      principalKey: input.principalKey,
      bundleKey: input.bundleKey,
    }).then(
      (copy) => {
        if (current && selectionGenerationRef.current === selectionGeneration)
          acceptCopy(copy);
      },
      (error: unknown) => {
        if (current && selectionGenerationRef.current === selectionGeneration)
          setState({
            copy: null,
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          });
      },
    );
    return () => {
      current = false;
    };
  }, [
    acceptCopy,
    input.bundleKey,
    input.chatEndpoint,
    input.currentOrigin,
    input.enabled,
    input.principalKey,
  ]);

  const persistDefinition = useCallback(
    (change: {
      readonly definition: SDCPN;
      readonly previousRevisionId: DocumentRevisionId;
      readonly revisionId: DocumentRevisionId;
    }): Promise<void> => {
      const copy = copyRef.current;
      if (copy === null)
        return Promise.reject(new Error("Worked-model copy is not available."));
      const selectionGeneration = selectionGenerationRef.current;
      const write = writeQueueRef.current.then(async () => {
        const writeBase = writeBasesRef.current.get(copy.copyId) ?? copy;
        if (writeBase.revisionId !== change.previousRevisionId)
          throw new Error(
            "Worked-model document revision does not follow its queued predecessor.",
          );
        const updated = await updateWorkedModelDefinition({
          chatEndpoint: input.chatEndpoint,
          currentOrigin: input.currentOrigin,
          principalKey: input.principalKey,
          copyId: copy.copyId,
          expectedSha256: writeBase.definitionSha256,
          expectedRevisionId: change.previousRevisionId,
          definition: change.definition,
          revisionId: change.revisionId,
        });
        writeBasesRef.current.set(copy.copyId, updated);
        if (
          selectionGenerationRef.current === selectionGeneration &&
          copyRef.current?.copyId === copy.copyId
        )
          acceptCopy(updated);
      });
      writesByRevisionRef.current.set(change.revisionId, write);
      if (writesByRevisionRef.current.size > 64) {
        const oldestRevision = writesByRevisionRef.current.keys().next().value;
        if (oldestRevision !== undefined)
          writesByRevisionRef.current.delete(oldestRevision);
      }
      void write.catch((error: unknown) => {
        if (selectionGenerationRef.current !== selectionGeneration) return;
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error : new Error(String(error)),
          loading: false,
        }));
      });
      writeQueueRef.current = write.catch(() => undefined);
      return write;
    },
    [acceptCopy, input.chatEndpoint, input.currentOrigin, input.principalKey],
  );

  const settleDocumentRevision = useCallback(
    async (revisionId: DocumentRevisionId): Promise<void> => {
      const write = writesByRevisionRef.current.get(revisionId);
      if (write === undefined) {
        if (copyRef.current?.revisionId === revisionId) return;
        throw new Error(
          `Worked-model revision ${revisionId} has no persistence operation.`,
        );
      }
      try {
        await write;
      } finally {
        if (writesByRevisionRef.current.get(revisionId) === write)
          writesByRevisionRef.current.delete(revisionId);
      }
    },
    [],
  );

  const createCleanCopy = useCallback(async (): Promise<void> => {
    if (!input.enabled || input.bundleKey === undefined)
      throw new Error("Worked-model bundle is not selected.");
    const selectionGeneration = selectionGenerationRef.current;
    await writeQueueRef.current;
    const cleanCopy = await createCleanWorkedModelCopy({
      chatEndpoint: input.chatEndpoint,
      currentOrigin: input.currentOrigin,
      principalKey: input.principalKey,
      bundleKey: input.bundleKey,
    });
    if (selectionGenerationRef.current !== selectionGeneration)
      throw new Error("Worked-model selection changed while creating a copy.");
    acceptCopy(cleanCopy);
  }, [
    acceptCopy,
    input.bundleKey,
    input.chatEndpoint,
    input.currentOrigin,
    input.enabled,
    input.principalKey,
  ]);

  return {
    ...state,
    createCleanCopy,
    persistDefinition,
    settleDocumentRevision,
  };
};
