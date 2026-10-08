/**
 * @vitest-environment jsdom
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useVoiceMediationHistory } from "./use-voice-mediation-history";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("switching away and back returns the history an in-flight turn began in", () => {
  const { result, rerender } = renderHook(
    ({ conversationId }: { conversationId: string | null }) =>
      useVoiceMediationHistory(conversationId),
    { initialProps: { conversationId: "first" as string | null } },
  );
  const first = result.current;
  first?.begin({ id: "turn", text: "Compare two to eight agents" });

  rerender({ conversationId: "second" });
  expect(result.current).not.toBe(first);
  rerender({ conversationId: null });
  expect(result.current).toBeUndefined();
  rerender({ conversationId: "first" });

  expect(result.current).toBe(first);
  expect(result.current?.project([])[0]?.parts[0]).toEqual({
    type: "text",
    text: "Compare two to eight agents",
  });
});
