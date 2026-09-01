/**
 * @vitest-environment jsdom
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import { useFlueChatHistory } from "./use-flue-chat-history";

const brunchEndpoint = "https://brunch.test/api/chat";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("hydrates from the configured Brunch endpoint", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      messages: [{ id: "assistant-1", role: "assistant", parts: [] }],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() =>
    useFlueChatHistory(brunchEndpoint, "conversation-1", "principal-1"),
  );

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.messages).toStrictEqual([
    { id: "assistant-1", role: "assistant", parts: [] },
  ]);

  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    URL,
    { headers: Record<string, string> },
  ];
  expect(url.toString()).toBe("https://brunch.test/api/chat?id=conversation-1");
  expect(init.headers[BRUNCH_PRINCIPAL_HEADER]).toBe("principal-1");
});

test("asks nothing of the generic chat route, which keeps no history", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() =>
    useFlueChatHistory(null, "conversation-1", "principal-1"),
  );

  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.current.ready).toBe(false);
  expect(result.current.messages).toBeUndefined();
});

test("leaves the panel on its local cache when hydration fails", async () => {
  const fetchMock = vi.fn(
    async () => new Response("Method not allowed", { status: 405 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() =>
    useFlueChatHistory(brunchEndpoint, "conversation-1", "principal-1"),
  );

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(result.current.ready).toBe(false);
  expect(result.current.messages).toBeUndefined();
});
