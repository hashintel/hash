import { useEffect, useRef, useState } from "react";

import { useLatest } from "../shared/use-latest";

/** The three calls the language client offers for one kind of temporary session. */
interface LspSession<Content> {
  initialize: (params: Content & { sessionId: string }) => void;
  update: (params: Content & { sessionId: string }) => void;
  kill: (sessionId: string) => void;
}

/**
 * Keeps a temporary language session for the calling component's life:
 * started on mount, updated when `contentKey` changes, ended on unmount.
 * Returns the session's id: the given one, or one generated per mount. A new
 * given id ends the old session and starts the new one.
 *
 * `contentKey` stands for what the session holds. `content` may be a new
 * object on every render: it is sent only when the key changes, which keeps
 * a caller that rebuilds the same content from updating the worker, and the
 * worker's diagnostics from rendering that caller, in a loop.
 */
export const useLspSession = <Content extends object>(
  { initialize, update, kill }: LspSession<NoInfer<Content>>,
  content: Content,
  contentKey: unknown,
  givenSessionId?: string,
): string => {
  const [generatedSessionId] = useState(() => crypto.randomUUID());
  const sessionId = givenSessionId ?? generatedSessionId;
  const latestContent = useLatest(content);
  const initializedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const params = { ...latestContent.current, sessionId };
    if (initializedIdRef.current !== sessionId) {
      initialize(params);
      initializedIdRef.current = sessionId;
    } else {
      update(params);
    }
  }, [contentKey, initialize, latestContent, sessionId, update]);

  useEffect(() => {
    return () => {
      kill(sessionId);
    };
  }, [kill, sessionId]);

  return sessionId;
};
