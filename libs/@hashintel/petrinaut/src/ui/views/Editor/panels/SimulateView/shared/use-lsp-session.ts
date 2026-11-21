import { useEffect, useRef } from "react";

import { useLatest } from "../../../../../../react/hooks/use-latest";

/** The three calls the language client offers for one kind of temporary session. */
interface LspSession<Params extends { sessionId: string }> {
  initialize: (params: Params) => void;
  update: (params: Params) => void;
  kill: (sessionId: string) => void;
}

/**
 * Keeps a temporary language session for the calling component's life:
 * started on mount, updated when `contentKey` changes, ended on unmount.
 *
 * `contentKey` stands for what the session holds. `params` may be a new
 * object on every render: it is sent only when the key changes, which keeps
 * a caller that rebuilds the same content from updating the worker, and the
 * worker's diagnostics from rendering that caller, in a loop.
 */
export const useLspSession = <Params extends { sessionId: string }>(
  { initialize, update, kill }: LspSession<Params>,
  params: Params,
  contentKey: string,
): void => {
  const { sessionId } = params;
  const latestParams = useLatest(params);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initialize(latestParams.current);
      initializedRef.current = true;
    } else {
      update(latestParams.current);
    }
  }, [contentKey, initialize, latestParams, sessionId, update]);

  useEffect(() => {
    return () => {
      kill(sessionId);
    };
  }, [kill, sessionId]);
};
