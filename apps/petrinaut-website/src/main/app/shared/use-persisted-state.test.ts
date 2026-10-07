/**
 * @vitest-environment jsdom
 */
import { act, render, renderHook } from "@testing-library/react";
import { createElement, StrictMode, Suspense } from "react";
import { expect, test, vi } from "vitest";

import { usePersistedState } from "./use-persisted-state";

test("does not read browser storage for an abandoned render", () => {
  const read = vi.fn(() => "persisted");
  const never = new Promise<void>(() => {});
  const Probe = () => {
    usePersistedState({
      fallback: "fallback",
      read,
      write: () => {},
    });
    throw never;
  };

  render(createElement(Suspense, { fallback: null }, createElement(Probe)));

  expect(read).not.toHaveBeenCalled();
});

test("evaluates an update once and persists it outside React's updater", () => {
  const write = vi.fn();
  const update = vi.fn((previous: number) => previous + 1);
  const { result } = renderHook(
    () =>
      usePersistedState({
        fallback: 0,
        read: () => 0,
        write,
      }),
    {
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    },
  );

  act(() => result.current[1](update));

  expect(update).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledWith(1);
});

test("preserves consecutive in-memory updates when persistence is unavailable", () => {
  const fallback: string[] = [];
  const read = () => fallback;
  const { result } = renderHook(() =>
    usePersistedState({
      fallback,
      read,
      write: () => {},
      storageKey: "unavailable-storage-test",
    }),
  );
  act(() => {
    result.current[1]((previous) => [...previous, "first"]);
    result.current[1]((previous) => [...previous, "second"]);
  });
  expect(result.current[0]).toEqual(["first", "second"]);
});

test("subscribes to its local storage key and releases the subscription", () => {
  const storageKey = "persisted-state-test";
  const read = vi.fn(() => localStorage.getItem(storageKey) ?? "empty");
  const write = (value: string) => localStorage.setItem(storageKey, value);
  const { result, unmount } = renderHook(() =>
    usePersistedState({
      fallback: "empty",
      read,
      write,
      storageKey,
    }),
  );
  try {
    localStorage.setItem(storageKey, "from-another-tab");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: storageKey,
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current[0]).toBe("from-another-tab");

    read.mockClear();
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unrelated",
          storageArea: localStorage,
        }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: storageKey,
          storageArea: sessionStorage,
        }),
      );
    });
    expect(read).not.toHaveBeenCalled();

    localStorage.removeItem(storageKey);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: null,
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current[0]).toBe("empty");

    unmount();
    read.mockClear();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: storageKey,
        storageArea: localStorage,
      }),
    );
    expect(read).not.toHaveBeenCalled();
  } finally {
    unmount();
    localStorage.removeItem(storageKey);
  }
});
