/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { useStore, useStoreSelector } from "./use-store";

import type { ReadableStore } from "@hashintel/petrinaut-core";

afterEach(cleanup);

test.each([
  ["whole snapshot", (store: ReadableStore<number>) => useStore(store)],
  [
    "selected snapshot",
    (store: ReadableStore<number>) => useStoreSelector(store, String),
  ],
])("keeps the %s subscription across parent rerenders", (_name, useValue) => {
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(() => unsubscribe);
  const store: ReadableStore<number> = {
    get: () => 1,
    subscribe,
  };
  const { rerender, unmount } = renderHook(() => useValue(store));

  rerender();

  expect(subscribe).toHaveBeenCalledOnce();
  expect(unsubscribe).not.toHaveBeenCalled();
  unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("does not rerender when the selected snapshot is unchanged", () => {
  type Snapshot = { readonly selected: string; readonly unrelated: number };
  let current: Snapshot = { selected: "kept", unrelated: 0 };
  const listeners = new Set<(value: Snapshot) => void>();
  const store: ReadableStore<Snapshot> = {
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const renders = vi.fn();
  const { result } = renderHook(() => {
    renders();
    return useStoreSelector(store, (snapshot) => snapshot.selected);
  });

  act(() => {
    current = { selected: "kept", unrelated: 1 };
    for (const listener of listeners) listener(current);
  });

  expect(result.current).toBe("kept");
  expect(renders).toHaveBeenCalledOnce();
});
