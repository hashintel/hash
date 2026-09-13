import { useCallback, useEffect, useRef, useState } from "react";

import {
  createCleanNetProjection as requestCleanNetProjection,
  resolveNetProjection,
  updateNetProjectionDefinition,
  type WorkedModelNetProjection,
} from "./worked-model-net-projection-client";

import type { DocumentRevisionId, SDCPN } from "@hashintel/petrinaut-core";

interface WorkedModelNetProjectionState {
  readonly netProjection: WorkedModelNetProjection | null;
  readonly error: Error | null;
  readonly loading: boolean;
}

const initialState: WorkedModelNetProjectionState = {
  netProjection: null,
  error: null,
  loading: false,
};

export const useWorkedModelNetProjection = (input: {
  readonly bundleKey: string | undefined;
  readonly chatEndpoint: string;
  readonly currentOrigin: string;
  readonly enabled: boolean;
  readonly principalKey: string;
}) => {
  const [state, setState] =
    useState<WorkedModelNetProjectionState>(initialState);
  const netProjectionRef = useRef<WorkedModelNetProjection | null>(null);
  const selectionGenerationRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const writeBasesByDocumentIdRef = useRef(
    new Map<string, WorkedModelNetProjection>(),
  );
  const writesByRevisionRef = useRef(
    new Map<DocumentRevisionId, Promise<void>>(),
  );

  const acceptNetProjection = useCallback(
    (netProjection: WorkedModelNetProjection) => {
      netProjectionRef.current = netProjection;
      writeBasesByDocumentIdRef.current.set(
        netProjection.documentId,
        netProjection,
      );
      setState({ netProjection, error: null, loading: false });
    },
    [],
  );

  useEffect(() => {
    const selectionGeneration = selectionGenerationRef.current + 1;
    selectionGenerationRef.current = selectionGeneration;
    netProjectionRef.current = null;
    writeQueueRef.current = Promise.resolve();
    if (!input.enabled || input.bundleKey === undefined) {
      setState(initialState);
      return;
    }
    let current = true;
    setState({ netProjection: null, error: null, loading: true });
    void resolveNetProjection({
      chatEndpoint: input.chatEndpoint,
      currentOrigin: input.currentOrigin,
      principalKey: input.principalKey,
      bundleKey: input.bundleKey,
    }).then(
      (netProjection) => {
        if (current && selectionGenerationRef.current === selectionGeneration)
          acceptNetProjection(netProjection);
      },
      (error: unknown) => {
        if (current && selectionGenerationRef.current === selectionGeneration)
          setState({
            netProjection: null,
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          });
      },
    );
    return () => {
      current = false;
    };
  }, [
    acceptNetProjection,
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
      const netProjection = netProjectionRef.current;
      if (netProjection === null)
        return Promise.reject(
          new Error("Worked-model net projection is not available."),
        );
      const selectionGeneration = selectionGenerationRef.current;
      const write = writeQueueRef.current.then(async () => {
        const writeBase =
          writeBasesByDocumentIdRef.current.get(netProjection.documentId) ??
          netProjection;
        if (writeBase.revisionId !== change.previousRevisionId)
          throw new Error(
            "Worked-model document revision does not follow its queued predecessor.",
          );
        const updated = await updateNetProjectionDefinition({
          chatEndpoint: input.chatEndpoint,
          currentOrigin: input.currentOrigin,
          principalKey: input.principalKey,
          copyId: netProjection.copyId,
          expectedSha256: writeBase.definitionSha256,
          expectedRevisionId: change.previousRevisionId,
          definition: change.definition,
          revisionId: change.revisionId,
        });
        writeBasesByDocumentIdRef.current.set(
          netProjection.documentId,
          updated,
        );
        if (
          selectionGenerationRef.current === selectionGeneration &&
          netProjectionRef.current?.documentId === netProjection.documentId
        )
          acceptNetProjection(updated);
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
    [
      acceptNetProjection,
      input.chatEndpoint,
      input.currentOrigin,
      input.principalKey,
    ],
  );

  const settleDocumentRevision = useCallback(
    async (revisionId: DocumentRevisionId): Promise<void> => {
      const write = writesByRevisionRef.current.get(revisionId);
      if (write === undefined) {
        if (netProjectionRef.current?.revisionId === revisionId) return;
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

  const createCleanNetProjection = useCallback(async (): Promise<void> => {
    if (!input.enabled || input.bundleKey === undefined)
      throw new Error("Worked-model template is not selected.");
    const selectionGeneration = selectionGenerationRef.current;
    await writeQueueRef.current;
    const cleanNetProjection = await requestCleanNetProjection({
      chatEndpoint: input.chatEndpoint,
      currentOrigin: input.currentOrigin,
      principalKey: input.principalKey,
      bundleKey: input.bundleKey,
    });
    if (selectionGenerationRef.current !== selectionGeneration)
      throw new Error(
        "Worked-model selection changed while creating a net projection.",
      );
    acceptNetProjection(cleanNetProjection);
  }, [
    acceptNetProjection,
    input.bundleKey,
    input.chatEndpoint,
    input.currentOrigin,
    input.enabled,
    input.principalKey,
  ]);

  return {
    ...state,
    createCleanNetProjection,
    persistDefinition,
    settleDocumentRevision,
  };
};
