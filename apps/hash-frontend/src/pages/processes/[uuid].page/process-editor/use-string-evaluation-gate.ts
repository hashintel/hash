import { useEffect, useState } from "react";

import { isProcessEditorPath } from "../../../../lib/csp";

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
 * Whether the process editor may render Petrinaut yet: `false` while the
 * gate is deciding (and for good once it has started a reload), `true` after.
 * See {@link runStringEvaluationGate}.
 */
export const useStringEvaluationGate = (): boolean => {
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    const shouldRender = runStringEvaluationGate({
      canEvaluate: canEvaluateStrings,
      documentPathname: readDocumentPathname,
      reload: () => window.location.reload(),
    });
    if (shouldRender) {
      setCanRender(true);
    }
  }, []);

  return canRender;
};
