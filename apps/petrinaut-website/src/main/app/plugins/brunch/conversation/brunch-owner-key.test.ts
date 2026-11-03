import { expect, test, vi } from "vitest";

import { getOrCreateBrunchOwnerKey } from "./brunch-owner-key";

test("reads and writes the owner key under its pre-rename storage key", () => {
  const writes: [string, string][] = [];
  const storage = {
    getItem: (key: string) => (key === "brunch-principal-v1" ? "stored" : null),
    setItem: (key: string, value: string) => writes.push([key, value]),
  };
  expect(getOrCreateBrunchOwnerKey(storage)).toBe("stored");

  getOrCreateBrunchOwnerKey(
    { getItem: () => null, setItem: storage.setItem },
    () => "created",
  );
  expect(writes).toEqual([["brunch-principal-v1", "created"]]);
});

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
