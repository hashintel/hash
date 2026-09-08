import { useEffect, useState } from "react";

import {
  loadOAuthSession,
  type OAuthSessionSnapshot,
} from "./oauth-session-client";

import type { OAuthSessionState } from "@hashintel/oauth-session";

/**
 * The current sign-in, probed once on mount.
 *
 * An effect because the answer lives on the server and only the server can
 * read the session — the cookie carrying it is `HttpOnly`, so there is nothing
 * here to derive it from. The `loading` state is a real third case rather than
 * an optimistic guess: rendering as signed out and then correcting would flash
 * a sign-in item at somebody who is already signed in.
 */
export const useOAuthSession = (): OAuthSessionSnapshot => {
  const [state, setState] = useState<OAuthSessionState | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    void loadOAuthSession(
      globalThis.fetch.bind(globalThis),
      abortController.signal,
    ).then((next) => {
      if (!abortController.signal.aborted) {
        setState(next);
      }
    });

    return () => abortController.abort();
  }, []);

  return state === null
    ? { status: "loading" }
    : { status: "loaded", ...state };
};
