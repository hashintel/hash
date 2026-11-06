import { type NextRouter, useRouter } from "next/router";
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
 * @returns a function that stops watching for route changes. A reload
 *   already armed by one still runs: it fires after the editor unmounts.
 */
export const reloadOnLeavingEditorPolicy = ({
  events,
  documentPathname,
  origin,
  reload,
}: {
  events: RouterEvents;
  documentPathname: () => string | null;
  origin: string;
  reload: () => void;
}): (() => void) => {
  const loadedAt = documentPathname();
  if (loadedAt === null || !isProcessEditorPath(loadedAt)) {
    return () => {};
  }

  const onRouteChangeStart = (url: string) => {
    if (isProcessEditorPath(new URL(url, origin).pathname)) {
      return;
    }
    let disarm = () => {};
    const onRouteChangeComplete = () => {
      disarm();
      reload();
    };
    // A route change that is cancelled or fails leaves the editor in place.
    const onRouteChangeError = () => disarm();
    disarm = () => {
      events.off("routeChangeComplete", onRouteChangeComplete);
      events.off("routeChangeError", onRouteChangeError);
    };
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
      origin: window.location.origin,
      reload: () => window.location.reload(),
    });
  }, [events]);

  return canRender;
};
