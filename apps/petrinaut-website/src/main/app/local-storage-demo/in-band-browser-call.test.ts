import { afterEach, expect, test, vi } from "vitest";

import { createInBandBrowserCalls } from "./in-band-browser-call";

import type { FlueClient } from "@flue/sdk";

const binding = {
  conversationId: "conversation",
  documentId: "document",
  incarnationId: "incarnation",
};
const input = {
  id: "place",
  name: "Place",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

afterEach(() => vi.unstubAllGlobals());

test("an unknown mutation record is submitted without failing the call", async () => {
  const posted: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(
          typeof init.body === "string" ? JSON.parse(init.body) : init.body,
        );
        return new Response(null, { status: 200 });
      }
      return Response.json({
        capability: "capability",
        binding: JSON.stringify(binding),
        toolName: "addPlace",
        input,
      });
    }),
  );
  const calls = createInBandBrowserCalls({
    client: Promise.resolve({
      url: "http://brunch.local/agents/chat/instance",
    } as FlueClient),
    principalKey: "principal",
    binding,
    // Classification doubt is diagnostic evidence, not a reason to refuse the result.
    metadataFor: () =>
      ({
        canonicalMutationRecord: { outcome: "unknown" },
      }) as unknown as ReturnType<
        Parameters<typeof createInBandBrowserCalls>[0]["metadataFor"]
      >,
    prepareInput: () => {},
  });

  const issued = await calls.claim({
    toolCallId: "call",
    toolName: "addPlace",
    input,
    signal: new AbortController().signal,
  });

  await expect(issued.submit({ applied: true })).resolves.toBeUndefined();
  expect(posted).toEqual([
    expect.objectContaining({ output: { applied: true } }),
  ]);
  issued.release();
});
