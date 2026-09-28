import { afterEach, expect, test, vi } from "vitest";

import { canonicalContent } from "@hashintel/brunch-agent-plugin-sdcpn";

import { createInBandBrowserCalls } from "./in-band-browser-call";

import type { FlueClient } from "@flue/sdk";

const binding = {
  conversationId: "conversation",
  documentId: "document",
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
        binding: canonicalContent(binding),
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
    acceptsRevision: () => true,
  });

  await expect(
    calls.run(
      {
        toolCallId: "call",
        toolName: "addPlace",
        input,
        signal: new AbortController().signal,
      },
      async () => ({ applied: true }),
    ),
  ).resolves.toBeUndefined();
  expect(posted).toEqual([
    expect.objectContaining({ output: { applied: true } }),
  ]);
});

test("the binding matches the issued call whatever its key order", async () => {
  const claimUrls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      if (typeof url === "string") claimUrls.push(url);
      return Response.json({
        capability: "capability",
        binding: canonicalContent(binding),
        toolName: "addPlace",
        input,
      });
    }),
  );
  const reordered = {
    documentId: binding.documentId,
    conversationId: binding.conversationId,
  };
  const calls = createInBandBrowserCalls({
    client: Promise.resolve({
      url: "http://brunch.local/agents/chat/instance",
    } as FlueClient),
    principalKey: "principal",
    binding: reordered,
    metadataFor: () => undefined,
    prepareInput: () => {},
    acceptsRevision: () => true,
  });

  await calls.run(
    {
      toolCallId: "call",
      toolName: "addPlace",
      input,
      signal: new AbortController().signal,
    },
    async () => ({ applied: true }),
  );

  expect(new URL(claimUrls[0] ?? "").searchParams.get("binding")).toBe(
    canonicalContent(binding),
  );
});

const stubIssuingFetch = () => {
  const posted: { url: string; disposition: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === "POST") {
        const body: unknown =
          typeof init.body === "string" ? JSON.parse(init.body) : null;
        posted.push({
          url: typeof url === "string" ? url : "",
          disposition:
            typeof body === "object" && body !== null && "disposition" in body
              ? body.disposition
              : undefined,
        });
        return new Response(null, { status: 200 });
      }
      return Response.json({
        capability: "capability",
        binding: canonicalContent(binding),
        toolName: "addPlace",
        input,
      });
    }),
  );
  return posted;
};

const createCalls = (
  prepareInput: Parameters<
    typeof createInBandBrowserCalls
  >[0]["prepareInput"] = () => {},
) =>
  createInBandBrowserCalls({
    client: Promise.resolve({
      url: "http://brunch.local/agents/chat/instance",
    } as FlueClient),
    principalKey: "principal",
    binding,
    metadataFor: () => undefined,
    prepareInput,
    acceptsRevision: () => true,
  });

test("a call that throws once executed is reported failed", async () => {
  const posted = stubIssuingFetch();
  const failure = new Error("executor failed");

  await expect(
    createCalls().run(
      {
        toolCallId: "call",
        toolName: "addPlace",
        input,
        signal: new AbortController().signal,
      },
      async () => {
        throw failure;
      },
    ),
  ).rejects.toBe(failure);
  expect(posted).toEqual([
    {
      url: "http://brunch.local/agents/chat/instance/browser-calls/call/fail",
      disposition: "failed",
    },
  ]);
});

test("a call that cannot be prepared is reported unstarted without executing", async () => {
  const posted = stubIssuingFetch();
  const execute = vi.fn(async () => ({ applied: true }));

  await expect(
    createCalls(() => {
      throw new Error("input mapping failed");
    }).run(
      {
        toolCallId: "call",
        toolName: "addPlace",
        input,
        signal: new AbortController().signal,
      },
      execute,
    ),
  ).rejects.toThrow("input mapping failed");
  expect(execute).not.toHaveBeenCalled();
  expect(posted).toEqual([
    {
      url: "http://brunch.local/agents/chat/instance/browser-calls/call/fail",
      disposition: "unstarted",
    },
  ]);
});

test("a call stopped during its claim neither executes nor reports", async () => {
  const posted = stubIssuingFetch();
  const stop = new AbortController();
  const execute = vi.fn(async () => ({ applied: true }));
  const calls = createCalls(() => {});
  const running = calls.run(
    { toolCallId: "call", toolName: "addPlace", input, signal: stop.signal },
    execute,
  );
  stop.abort();

  await running.catch(() => {});
  expect(execute).not.toHaveBeenCalled();
  expect(posted).toEqual([]);
});

test("a change whose expected revision the document has left is reported stale and never prepared", async () => {
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
        binding: canonicalContent(binding),
        toolName: "addPlace",
        input,
        expectedRevision: "r1",
      });
    }),
  );
  const prepareInput = vi.fn<() => void>();
  const accepted: string[] = [];
  const calls = createInBandBrowserCalls({
    client: Promise.resolve({
      url: "http://brunch.local/agents/chat/instance",
    } as FlueClient),
    principalKey: "principal",
    binding,
    metadataFor: () => undefined,
    prepareInput,
    acceptsRevision: (expected) => {
      accepted.push(expected);
      return false;
    },
  });

  const issued = await calls.claim({
    toolCallId: "call",
    toolName: "addPlace",
    input,
    signal: new AbortController().signal,
  });
  expect(() => issued.prepare()).toThrow(/changed by other means/u);
  expect(accepted).toEqual(["r1"]);
  expect(prepareInput).not.toHaveBeenCalled();
  await issued.fail("unstarted");
  expect(posted).toEqual([expect.objectContaining({ disposition: "stale" })]);
});
