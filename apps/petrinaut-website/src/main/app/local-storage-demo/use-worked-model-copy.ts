import { useCallback, useEffect, useRef, useState } from "react";

import {
  createCleanWorkedModelCopy,
  resolveWorkedModelCopy,
  updateWorkedModelDefinition,
  type WorkedModelCopy,
} from "./worked-model-client";

import type { SDCPN } from "@hashintel/petrinaut-core";

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
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const acceptCopy = useCallback((copy: WorkedModelCopy) => {
    copyRef.current = copy;
    setState({ copy, error: null, loading: false });
  }, []);

  useEffect(() => {
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
        if (current) acceptCopy(copy);
      },
      (error: unknown) => {
        if (current)
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
    (definition: SDCPN): Promise<void> => {
      const write = writeQueueRef.current.then(async () => {
        const copy = copyRef.current;
        if (copy === null)
          throw new Error("Worked-model copy is not available.");
        const updated = await updateWorkedModelDefinition({
          chatEndpoint: input.chatEndpoint,
          currentOrigin: input.currentOrigin,
          principalKey: input.principalKey,
          copyId: copy.copyId,
          expectedSha256: copy.definitionSha256,
          definition,
        });
        acceptCopy(updated);
      });
      void write.catch((error: unknown) => {
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

  const createCleanCopy = useCallback(async (): Promise<void> => {
    if (!input.enabled || input.bundleKey === undefined)
      throw new Error("Worked-model bundle is not selected.");
    await writeQueueRef.current;
    acceptCopy(
      await createCleanWorkedModelCopy({
        chatEndpoint: input.chatEndpoint,
        currentOrigin: input.currentOrigin,
        principalKey: input.principalKey,
        bundleKey: input.bundleKey,
      }),
    );
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
  };
};
