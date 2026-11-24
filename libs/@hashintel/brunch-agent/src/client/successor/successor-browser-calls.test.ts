import { afterEach, describe, expect, test, vi } from "vitest";

import { canonicalContent } from "@hashintel/brunch-agent";

import { BROWSER_CALL_STALE_MESSAGE } from "../tools/in-band-browser-call";
import { createSuccessorBrowserCalls } from "./successor-browser-calls";

import type { InBandBrowserCallAdmission } from "../tools/in-band-browser-call";

const binding = { conversationId: "conversation", documentId: "document" };
const input = {
  id: "place",
  name: "Place",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};

test("a change whose expected revision the document has left fails as stale and never starts", async () => {
  const posted: { route: string; body: unknown }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const href = url instanceof Request ? url.url : url.toString();
    const route = href.split("/browser-calls/call")[1] ?? "";
    posted.push({
      route,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return route === ""
      ? Response.json({
          capability: "capability",
          binding: canonicalContent(binding),
          toolName: "addPlace",
          input,
          expectedRevision: "r-seen",
        })
      : Response.json({ failed: true });
  });
  const prepareInput = vi.fn();
  const execute = vi.fn(async () => ({ applied: true }));
  const calls = createSuccessorBrowserCalls({
    conversation: {
      endpoint: "http://durable.test",
      actorKey: "actor",
      conversationId: binding.conversationId,
      web: "web",
      fetch,
    },
    binding,
    claimant: "tab",
    metadataFor: () => undefined,
    prepareInput,
    admit: async () => ({ admitted: true }),
    acceptsRevision: () => false,
  });

  await expect(
    calls.run(
      {
        toolCallId: "call",
        toolName: "addPlace",
        input,
        signal: new AbortController().signal,
      },
      execute,
    ),
  ).rejects.toThrow(BROWSER_CALL_STALE_MESSAGE);

  expect(posted.map(({ route }) => route)).toEqual(["", "/fail"]);
  expect(posted[1]?.body).toMatchObject({ disposition: "stale" });
  expect(prepareInput).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

describe("a claim lost to the lease check", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** How often the lease asks whether the claim still holds. */
  const leaseCheckMs = 5_000;

  /**
   * A server that hands the call to this tab, then answers its lease check
   * 409, and lists the call `admittable` or not.
   */
  const serverLosingTheClaim = ({
    admittable,
  }: {
    readonly admittable: boolean;
  }) => {
    const sent: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      const href = url instanceof Request ? url.url : url.toString();
      const route = `${init?.method ?? "GET"} ${href.split("/browser-calls")[1] ?? ""}`;
      sent.push(route);
      switch (route) {
        case "POST /call":
          return Response.json({
            capability: "capability",
            binding: canonicalContent(binding),
            toolName: "addPlace",
            input,
          });
        case "POST /call/lease":
          return Response.json({ error: "not-issued" }, { status: 409 });
        case "GET ":
          return Response.json({
            calls: {
              call: {
                toolCallId: "call",
                toolName: "addPlace",
                input,
                status: admittable ? "claimed" : "stopped",
                output: null,
                metadata: null,
                expiresAt: Date.now() + 60_000,
                admittable,
              },
            },
          });
        default:
          return Response.json({ settled: true });
      }
    });
    return { fetch, sent };
  };

  /** An approval that waits for the person, and is stopped when its signal aborts, as the panel's coordinator stops one. */
  const awaitingApproval: InBandBrowserCallAdmission = ({ signal }) =>
    new Promise((resolve) => {
      signal.addEventListener(
        "abort",
        () =>
          resolve({
            admitted: false,
            output: { applied: false, reason: "Stopped before approval." },
          }),
        { once: true },
      );
    });

  const tabOf = (
    fetch: typeof globalThis.fetch,
    admit: InBandBrowserCallAdmission,
  ) =>
    createSuccessorBrowserCalls({
      conversation: {
        endpoint: "http://durable.test",
        actorKey: "actor",
        conversationId: binding.conversationId,
        web: "web",
        fetch,
      },
      binding,
      claimant: "tab",
      metadataFor: () => undefined,
      prepareInput: () => {},
      admit,
      acceptsRevision: () => true,
    });

  const issuedCall = () => ({
    toolCallId: "call",
    toolName: "addPlace",
    input,
    signal: new AbortController().signal,
  });

  test("while its approval waits, and another tab can still take it, the card says it is open in another tab", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const server = serverLosingTheClaim({ admittable: true });
    const tab = tabOf(server.fetch, awaitingApproval);
    const execute = vi.fn(async () => ({ applied: true }));

    const ran = tab.run(issuedCall(), execute);
    await vi.waitFor(() => expect(server.sent).toEqual(["POST /call"]));
    await vi.advanceTimersByTimeAsync(leaseCheckMs);

    await expect(ran).resolves.toBeUndefined();
    expect(tab.openInOtherTabs.getSnapshot()).toEqual(new Set(["call"]));
    expect(server.sent).toEqual(["POST /call", "POST /call/lease", "GET "]);
    expect(execute).not.toHaveBeenCalled();
  });

  test("while its approval waits, for a call that has ended, the run returns quietly", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const server = serverLosingTheClaim({ admittable: false });
    const tab = tabOf(server.fetch, awaitingApproval);
    const execute = vi.fn(async () => ({ applied: true }));

    const ran = tab.run(issuedCall(), execute);
    await vi.waitFor(() => expect(server.sent).toEqual(["POST /call"]));
    await vi.advanceTimersByTimeAsync(leaseCheckMs);

    await expect(ran).resolves.toBeUndefined();
    expect(tab.openInOtherTabs.getSnapshot()).toEqual(new Set());
    expect(server.sent).toEqual(["POST /call", "POST /call/lease", "GET "]);
    expect(execute).not.toHaveBeenCalled();
  });

  test("after it started, the run returns quietly and posts no outcome", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const server = serverLosingTheClaim({ admittable: false });
    const tab = tabOf(server.fetch, async () => ({ admitted: true }));
    let finish: (output: unknown) => void = () => {};
    const executing = new Promise<unknown>((resolve) => {
      finish = resolve;
    });

    const ran = tab.run(issuedCall(), () => executing);
    await vi.waitFor(() =>
      expect(server.sent).toEqual(["POST /call", "POST /call/start"]),
    );
    await vi.advanceTimersByTimeAsync(leaseCheckMs);
    await vi.waitFor(() => expect(server.sent).toContain("POST /call/lease"));
    finish({ applied: true });

    await expect(ran).resolves.toBeUndefined();
    expect(tab.openInOtherTabs.getSnapshot()).toEqual(new Set());
    expect(server.sent).toEqual([
      "POST /call",
      "POST /call/start",
      "POST /call/lease",
    ]);
  });
});
