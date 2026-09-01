/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import { useFlueChatHistory } from "./use-flue-chat-history";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFlueChatHistory", () => {
  test("does not request history from the local chat fallback", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);

    const { result } = renderHook(() =>
      useFlueChatHistory("conversation-1", "principal-1", null),
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ messages: undefined, ready: false });
  });

  test("loads history from the configured Brunch endpoint", async () => {
    const messages = [
      {
        id: "message-1",
        parts: [{ text: "Stored message", type: "text" as const }],
        role: "user" as const,
      },
    ];
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ messages }),
    );
    vi.stubGlobal("fetch", fetch);

    const { result } = renderHook(() =>
      useFlueChatHistory(
        "conversation with spaces",
        "principal-1",
        "https://brunch.test/api/petrinaut/chat",
      ),
    );

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(fetch).toHaveBeenCalledWith(
      "https://brunch.test/api/petrinaut/chat?id=conversation%20with%20spaces",
      { headers: { [BRUNCH_PRINCIPAL_HEADER]: "principal-1" } },
    );
    expect(result.current.messages).toEqual(messages);
  });
});
