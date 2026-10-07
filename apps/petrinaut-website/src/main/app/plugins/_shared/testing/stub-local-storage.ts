import { vi } from "vitest";

/**
 * Node supplies its own `localStorage` global that shadows the jsdom one and
 * carries no `setItem`. An in-memory store stands in, holding `seed` as JSON.
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
