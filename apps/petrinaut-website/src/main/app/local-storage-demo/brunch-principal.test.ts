import { expect, test, vi } from "vitest";

import { getOrCreateBrunchPrincipal } from "./brunch-principal";

test("reuses one UI-shell principal across transport requests and reloads", () => {
  const storedPrincipalsByKey = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storedPrincipalsByKey.get(key) ?? null,
    setItem: (key: string, value: string) =>
      storedPrincipalsByKey.set(key, value),
  };
  const createPrincipal = vi.fn(() => "principal-created-once");

  expect(getOrCreateBrunchPrincipal(storage, createPrincipal)).toBe(
    "principal-created-once",
  );
  expect(getOrCreateBrunchPrincipal(storage, createPrincipal)).toBe(
    "principal-created-once",
  );
  expect(createPrincipal).toHaveBeenCalledOnce();
});
