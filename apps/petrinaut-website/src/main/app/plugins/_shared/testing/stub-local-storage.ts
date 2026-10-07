import { vi } from "vitest";

/**
 * Node 25 and later supply their own `localStorage` global, which shadows
 * jsdom's and has no `setItem`. An in-memory store stands in on every version,
 * holding `seed` as JSON.
 */
export const stubLocalStorage = (seed: Record<string, unknown> = {}) => {
  const entries = new Map(
    Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]),
  );
  vi.stubGlobal("localStorage", {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => entries.set(key, value),
  } satisfies Storage);
};
