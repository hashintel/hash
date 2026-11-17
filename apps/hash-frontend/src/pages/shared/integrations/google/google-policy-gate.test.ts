import { describe, expect, test, vi } from "vitest";

import { runGooglePolicyGate } from "./google-policy-gate";

const runGate = ({
  loadedAt,
  currentlyAt,
}: {
  loadedAt: string | null;
  currentlyAt: string;
}) => {
  const reload = vi.fn();
  const allowed = runGooglePolicyGate({
    documentPathname: () => loadedAt,
    currentPathname: () => currentlyAt,
    reload,
  });
  return { allowed, reload };
};

describe("runGooglePolicyGate", () => {
  test("loads Google in a document loaded at a Google route", () => {
    const { allowed, reload } = runGate({
      loadedAt: "/goals/new",
      currentlyAt: "/settings/integrations/google-sheets",
    });

    expect(allowed).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  test("loads Google when the document's load path is unknown", () => {
    const { allowed, reload } = runGate({
      loadedAt: null,
      currentlyAt: "/goals/new",
    });

    expect(allowed).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  test("reloads a document loaded elsewhere that has reached a Google route", () => {
    const { allowed, reload } = runGate({
      loadedAt: "/goals",
      currentlyAt: "/@alice/workers/00000000-0000-4000-8000-000000000002",
    });

    expect(allowed).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("doesn't reload at a route whose fresh load would block Google too", () => {
    const { allowed, reload } = runGate({
      loadedAt: "/goals",
      currentlyAt: "/@alice/entities/00000000-0000-4000-8000-000000000002",
    });

    expect(allowed).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
