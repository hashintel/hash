import Router, { type NextRouter, useRouter } from "next/router";
import { useEffect, useState } from "react";

import { isProcessEditorPath } from "../../../../lib/csp";

type RouterEvents = Pick<NextRouter["events"], "on" | "off">;

/**
 * Probes whether this document's Content Security Policy lets scripts
 * evaluate strings. A policy without `'unsafe-eval'` makes `new Function`
 * throw an `EvalError`.
 */
export const canEvaluateStrings = (): boolean => {
  try {
    // Constructing is enough: the policy is enforced when the string compiles.
    // eslint-disable-next-line no-new, no-new-func, @typescript-eslint/no-implied-eval -- the probe is the point
    new Function("return true;");
    return true;
  } catch (error) {
    if (error instanceof EvalError) {
      return false;
    }
    throw error;
  }
};

/**
 * The pathname this document was itself loaded at, which decides its policy.
 * Unlike `location`, client-side navigation doesn't change it. `null` when the
 * browser doesn't report the document's navigation.
 */
const readDocumentPathname = (): string | null => {
  const [entry] = performance.getEntriesByType("navigation");
  return entry ? new URL(entry.name).pathname : null;
};

/**
 * Decides whether Petrinaut can render in this document, reloading it when
 * it can't but a fresh load would fix that.
 *
 * Only the process editor route's policy lets Petrinaut evaluate strings, and
 * a document keeps the policy it was first loaded with, so reaching the editor
 * by client-side navigation from another route leaves Petrinaut blocked.
 * Reloading fetches a document at the editor's path, with the editor's policy.
 * A document already loaded at an editor path (or one whose load path is
 * unknown) is not reloaded, so a policy that still blocks evaluation can't
 * cause a reload loop; the editor renders and the failure surfaces there.
 *
 * @returns whether to render Petrinaut; `false` once a reload has started.
 */
export const runStringEvaluationGate = ({
  canEvaluate,
  documentPathname,
  reload,
}: {
  canEvaluate: () => boolean;
  documentPathname: () => string | null;
  reload: () => void;
}): boolean => {
  if (canEvaluate()) {
    return true;
  }
  const loadedAt = documentPathname();
  if (loadedAt === null || isProcessEditorPath(loadedAt)) {
    return true;
  }
  reload();
  return false;
};

/**
 * Reloads a document loaded at an editor path once a client-side navigation
 * has taken it to any other route, so that route runs under its own policy
 * rather than the editor's. Reloading after the route change completes,
 * rather than cancelling it, treats links, programmatic navigation and the
 * browser's back and forward buttons alike.
 *
 * Route changes overlap: a newer one cancels an older one, sometimes after
 * the older one has changed history. So each outcome the router reports is
 * judged by where it leaves the document, never by which change it ends.
 *
 * @returns a function that stops watching for route changes. Once one has
 *   started for another route, the outcome is still watched: it arrives
 *   after the editor unmounts.
 */
export const reloadOnLeavingEditorPolicy = ({
  events,
  documentPathname,
  committedAsPath,
  origin,
  reload,
}: {
  events: RouterEvents;
  documentPathname: () => string | null;
  /** The `asPath` the router has committed to its state, read when called. */
  committedAsPath: () => string;
  origin: string;
  reload: () => void;
}): (() => void) => {
  const loadedAt = documentPathname();
  if (loadedAt === null || !isProcessEditorPath(loadedAt)) {
    return () => {};
  }

  const isEditorUrl = (url: string) =>
    isProcessEditorPath(new URL(url, origin).pathname);

  let reloading = false;
  const settledAt = (url: string) => {
    if (reloading || isEditorUrl(url)) {
      return;
    }
    reloading = true;
    reload();
  };
  const onRouteChangeComplete = (url: string) => settledAt(url);
  // A cancelled change isn't an outcome: the change that cancelled it reports
  // its own. Next reports a failure it rendered its error page for only after
  // committing the failed route, so the router's path is the failed one. A
  // failure it hasn't committed, a page that fails to load, is followed by
  // the router's own document navigation.
  const onRouteChangeError = (
    error: { cancelled?: boolean },
    failedUrl: string,
  ) => {
    if (!error.cancelled && committedAsPath() === failedUrl) {
      settledAt(failedUrl);
    }
  };

  // Outcomes are watched from the first departure for another route until
  // the document reloads, so no outcome can disarm another change's.
  let armed = false;
  const onRouteChangeStart = (url: string) => {
    if (armed || isEditorUrl(url)) {
      return;
    }
    armed = true;
    events.on("routeChangeComplete", onRouteChangeComplete);
    events.on("routeChangeError", onRouteChangeError);
  };

  events.on("routeChangeStart", onRouteChangeStart);
  return () => events.off("routeChangeStart", onRouteChangeStart);
};

/**
 * Whether the process editor may render Petrinaut yet: `false` while the
 * gate is deciding (and for good once it has started a reload), `true` after.
 * See {@link runStringEvaluationGate}. Once Petrinaut may render, leaving the
 * editor for another route reloads the document; see
 * {@link reloadOnLeavingEditorPolicy}.
 */
export const useStringEvaluationGate = (): boolean => {
  const { events } = useRouter();
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    const shouldRender = runStringEvaluationGate({
      canEvaluate: canEvaluateStrings,
      documentPathname: readDocumentPathname,
      reload: () => window.location.reload(),
    });
    if (!shouldRender) {
      return undefined;
    }
    setCanRender(true);

    // Development's policy allows evaluation on every route.
    if (process.env.NODE_ENV === "development") {
      return undefined;
    }
    return reloadOnLeavingEditorPolicy({
      events,
      documentPathname: readDocumentPathname,
      // The singleton reads the live router; `useRouter()` returns a snapshot.
      committedAsPath: () => Router.asPath,
      origin: window.location.origin,
      reload: () => window.location.reload(),
    });
  }, [events]);

  return canRender;
};
