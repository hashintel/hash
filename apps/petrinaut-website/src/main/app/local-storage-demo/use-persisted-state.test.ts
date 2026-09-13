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
      enabled: true,
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
        enabled: true,
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
