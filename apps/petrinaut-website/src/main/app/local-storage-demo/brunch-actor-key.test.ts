import { expect, test, vi } from "vitest";

import { getOrCreateBrunchActorKey } from "./brunch-actor-key";

test("reads and writes the actor key under its pre-rename storage key", () => {
  const writes: [string, string][] = [];
  const storage = {
    getItem: (key: string) => (key === "brunch-principal-v1" ? "stored" : null),
    setItem: (key: string, value: string) => writes.push([key, value]),
  };
  expect(getOrCreateBrunchActorKey(storage)).toBe("stored");

  getOrCreateBrunchActorKey(
    { getItem: () => null, setItem: storage.setItem },
    () => "created",
  );
  expect(writes).toEqual([["brunch-principal-v1", "created"]]);
});

test("reuses one UI-shell actor key across transport requests and reloads", () => {
  const storedActorKeysByKey = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storedActorKeysByKey.get(key) ?? null,
    setItem: (key: string, value: string) =>
      storedActorKeysByKey.set(key, value),
  };
  const createActorKey = vi.fn(() => "actor-created-once");

  expect(getOrCreateBrunchActorKey(storage, createActorKey)).toBe(
    "actor-created-once",
  );
  expect(getOrCreateBrunchActorKey(storage, createActorKey)).toBe(
    "actor-created-once",
  );
  expect(createActorKey).toHaveBeenCalledOnce();
});
