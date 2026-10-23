import { expect, test, vi } from "vitest";

import { getOrCreateBrunchOwnerKey } from "./brunch-owner-key";

test("reuses one UI-shell owner key across transport requests and reloads", () => {
  const storedOwnerKeysByKey = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storedOwnerKeysByKey.get(key) ?? null,
    setItem: (key: string, value: string) =>
      storedOwnerKeysByKey.set(key, value),
  };
  const createOwnerKey = vi.fn(() => "owner-created-once");

  expect(getOrCreateBrunchOwnerKey(storage, createOwnerKey)).toBe(
    "owner-created-once",
  );
  expect(getOrCreateBrunchOwnerKey(storage, createOwnerKey)).toBe(
    "owner-created-once",
  );
  expect(createOwnerKey).toHaveBeenCalledOnce();
});
