import { afterEach, expect, test, vi } from "vitest";

import {
  brunchTools,
  canonicalContent,
  hashGraphReadToolNames,
} from "@hashintel/brunch-agent";

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
      url: "http://brunch.local/agents/petrinaut/instance",
    } as FlueClient),
    ownerKey: "owner",
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
      url: "http://brunch.local/agents/petrinaut/instance",
    } as FlueClient),
    ownerKey: "owner",
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
      url: "http://brunch.local/agents/petrinaut/instance",
    } as FlueClient),
    ownerKey: "owner",
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
      url: "http://brunch.local/agents/petrinaut/instance/browser-calls/call/fail",
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
      url: "http://brunch.local/agents/petrinaut/instance/browser-calls/call/fail",
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
      url: "http://brunch.local/agents/petrinaut/instance",
    } as FlueClient),
    ownerKey: "owner",
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

const hashRead = {
  toolName: brunchTools.queryHashEntities,
  input: { entityTypes: ["Supplier"], traversalDepth: 1 },
};
const stubHashReadFetch = () => {
  const posted: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === "POST") {
        posted.push({
          url: typeof url === "string" ? url : "",
          body: typeof init.body === "string" ? JSON.parse(init.body) : null,
        });
        return new Response(null, { status: 200 });
      }
      return Response.json({
        capability: "capability",
        binding: canonicalContent(binding),
        ...hashRead,
      });
    }),
  );
  return posted;
};

test("HASH's graph reads run in band beside the net tools, and the draft still runs through its card", () => {
  const calls = createCalls();
  expect(hashGraphReadToolNames.size).toBe(3);
  for (const name of hashGraphReadToolNames) expect(calls.has(name)).toBe(true);
  expect(calls.has("readNetOutline")).toBe(true);
  expect(calls.has(brunchTools.draftPetrinautExperiment)).toBe(false);
  expect(calls.has("unmounted_tool")).toBe(false);
});

test("HASH's entity read is claimed for the input the server issued and settles with the page's result", async () => {
  const posted = stubHashReadFetch();
  const output = { entities: [] };

  await createCalls().run(
    {
      toolCallId: "read",
      ...hashRead,
      signal: new AbortController().signal,
    },
    async (issuedInput) => {
      expect(issuedInput).toEqual(hashRead.input);
      return output;
    },
  );

  expect(posted.map(({ url }) => url)).toEqual([
    "http://brunch.local/agents/petrinaut/instance/browser-calls/read",
  ]);
  expect(posted[0]?.body).toMatchObject({
    toolName: brunchTools.queryHashEntities,
    canonicalInput: hashRead.input,
    output,
  });
});

test("a HASH entity read whose host tool throws is reported failed", async () => {
  const posted = stubHashReadFetch();
  const failure = new Error("GraphQL error");

  await expect(
    createCalls().run(
      { toolCallId: "read", ...hashRead, signal: new AbortController().signal },
      async () => {
        throw failure;
      },
    ),
  ).rejects.toBe(failure);
  expect(posted.map(({ url }) => url)).toEqual([
    "http://brunch.local/agents/petrinaut/instance/browser-calls/read/fail",
  ]);
  expect(posted[0]?.body).toMatchObject({ disposition: "failed" });
});
