import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  brunchHeaders,
  canonicalContent,
  type HandEditReportBody,
} from "@hashintel/brunch-agent";
import { createJsonDocHandle, type SDCPN } from "@hashintel/petrinaut-core";

import { documentRevisionOf } from "../../ui/tools/shared/document-revision";
import { createHandEditReporter } from "./hand-edit-reporter";

const conversation = {
  endpoint: "http://durable.test/",
  actorKey: "actor-1",
  conversationId: "brunch-construction-v1:net-1:evaluation-I",
  web: "web-1",
};
const documentId = "net-1";
/** SHA-256 of the actor key and conversation ID, NUL between: the server's instance ID. */
const instanceId = createHash("sha256")
  .update(`${conversation.actorKey}\0${conversation.conversationId}`)
  .digest("hex");
const handEditsUrl = `http://durable.test/conversations/${instanceId}/browser-calls/hand-edits`;
const binding = canonicalContent({
  conversationId: conversation.conversationId,
  documentId,
});

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const openDocument = () => {
  const handle = createJsonDocHandle({
    id: documentId,
    initial: structuredClone(emptyNet),
    capabilities: { disabledExtensions: [] },
  });
  let places = 0;
  const addPlace = () =>
    handle.change((draft) => {
      places += 1;
      draft.places.push({
        id: `place-${places}`,
        name: `Place ${places}`,
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      });
    });
  const revision = () => {
    const definition = handle.doc();
    return definition === undefined
      ? undefined
      : documentRevisionOf(definition);
  };
  return {
    document: {
      subscribe: (listener: () => void) => handle.subscribe(listener),
      revision,
    },
    addPlace,
    revision,
  };
};

type Sent = {
  readonly url: string;
  readonly init: RequestInit;
  readonly body: HandEditReportBody | undefined;
};

/** A `fetch` that answers every hand-edit report with `answer`, keeping each request. */
const serverAnswering = (
  answer: (body: HandEditReportBody) => Response | Promise<Response>,
) => {
  const sent: Sent[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init = {}) => {
    const body =
      typeof init.body === "string"
        ? (JSON.parse(init.body) as HandEditReportBody)
        : undefined;
    const url = input instanceof Request ? input.url : input.toString();
    sent.push({ url, init, body });
    return body === undefined
      ? new Response(null, { status: 400 })
      : answer(body);
  });
  return { fetch, sent };
};

const admitted = (body: HandEditReportBody) =>
  Response.json({
    reportId: `${body.episode}:${body.seq}`,
    submission: `submission-${body.seq}`,
    placement: "done",
  });

const idleMs = 1000;

beforeEach(() => {
  // The instance ID is a WebCrypto digest, which no fake timer advances.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createHandEditReporter", () => {
  test("an edit is reported once the document has been idle, to the conversation's hand-edits route", async () => {
    const net = openDocument();
    const server = serverAnswering(admitted);
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
    });
    const stop = reporter.start();

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs / 2);
    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs / 2);
    expect(server.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(idleMs);

    await vi.waitFor(() => expect(server.sent).toHaveLength(1));
    const [report] = server.sent;
    expect(report?.url).toBe(handEditsUrl);
    expect(report?.init).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(
      new Headers(report?.init.headers).get(brunchHeaders.conversation),
    ).toBe(conversation.conversationId);
    expect(new Headers(report?.init.headers).get(brunchHeaders.web)).toBe(
      conversation.web,
    );
    const { episode, ...placed } = report?.body ?? { episode: "" };
    expect(placed).toEqual({ binding, seq: 0, revision: net.revision() });
    expect(episode.length).toBeGreaterThan(0);
    expect(episode.length).toBeLessThanOrEqual(128);

    // Nothing more moved, so nothing more is said.
    await vi.advanceTimersByTimeAsync(idleMs * 5);
    expect(server.sent).toHaveLength(1);
    stop();
  });

  test("a reporter started again after a stop reports again, as React's development mounts do", async () => {
    const net = openDocument();
    const server = serverAnswering(admitted);
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
    });
    reporter.start()();
    const stop = reporter.start();

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs);

    await vi.waitFor(() => expect(server.sent).toHaveLength(1));
    stop();
  });

  test("an edit is reported before a claim, and the claim waits for the answer", async () => {
    const net = openDocument();
    let answer: (response: Response) => void = () => {};
    const server = serverAnswering(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
    });
    const stop = reporter.start();
    const calls = browserCalls();
    const reported = reporter.reportAround(calls);

    net.addPlace();
    const claimed = reported.claim(
      issued("draft-1", "draftPetrinautExperiment"),
    );
    await vi.waitFor(() => expect(server.sent).toHaveLength(1));
    expect(calls.claimed).toEqual([]);

    answer(admitted(server.sent[0]!.body!));
    await claimed;
    expect(calls.claimed).toEqual(["draft-1"]);
    // The idle report finds the edit already told.
    await vi.advanceTimersByTimeAsync(idleMs * 2);
    expect(server.sent).toHaveLength(1);
    stop();
  });

  test("no report is sent while a Brunch call runs; an edit made meanwhile is reported as it ends", async () => {
    const net = openDocument();
    const server = serverAnswering(admitted);
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
    });
    const stop = reporter.start();
    const calls = browserCalls();
    const reported = reporter.reportAround(calls);

    const experiment = calls.holdNext();
    const ran = reported.run(
      issued("experiment-1", "createExperiment"),
      async () => ({ ok: true }),
    );
    await experiment.started;
    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs * 3);
    expect(server.sent).toHaveLength(0);

    experiment.release();
    await ran;
    await vi.waitFor(() =>
      expect(server.sent.map(({ body }) => body?.revision)).toEqual([
        net.revision(),
      ]),
    );
    stop();
  });

  test("Brunch's own change is not reported, and an edit after the net it showed starts a new episode", async () => {
    const net = openDocument();
    const server = serverAnswering(admitted);
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
    });
    const stop = reporter.start();
    const reported = reporter.reportAround(browserCalls());

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs);
    await vi.waitFor(() => expect(server.sent).toHaveLength(1));
    // The panel runs the model's change, whose result reads the net back.
    await reported.run(issued("change-1", "addPlace"), async () => {
      net.addPlace();
      return { applied: true };
    });
    await vi.advanceTimersByTimeAsync(idleMs * 2);
    expect(server.sent).toHaveLength(1);

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs);
    await vi.waitFor(() => expect(server.sent).toHaveLength(2));

    const [first, second] = server.sent.map(({ body }) => body);
    expect(first?.seq).toBe(0);
    expect(second).toMatchObject({ seq: 0, revision: net.revision() });
    expect(second?.episode).not.toBe(first?.episode);
    stop();
  });

  test("a report before the conversation exists is dropped, not sent again", async () => {
    const net = openDocument();
    const server = serverAnswering(() =>
      Response.json({ error: "unknown-conversation" }, { status: 404 }),
    );
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
    });
    const stop = reporter.start();
    const reported = reporter.reportAround(browserCalls());

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs);
    await vi.waitFor(() => expect(server.sent).toHaveLength(1));
    await reported.claim(issued("draft-1", "draftPetrinautExperiment"));
    expect(server.sent).toHaveLength(1);

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs);
    await vi.waitFor(() => expect(server.sent).toHaveLength(2));
    stop();
  });

  test.each([
    [409, { error: "wrong-binding" }],
    [403, { error: "The conversation belongs to another web." }],
  ])(
    "a %i refusal stops reporting for the conversation",
    async (status, error) => {
      const net = openDocument();
      const server = serverAnswering(() => Response.json(error, { status }));
      const refusals: unknown[] = [];
      const reporter = createHandEditReporter({
        conversation: { ...conversation, fetch: server.fetch },
        documentId,
        document: net.document,
        idleMs,
        onRefused: (refusal) => refusals.push(refusal),
      });
      const stop = reporter.start();
      const reported = reporter.reportAround(browserCalls());

      net.addPlace();
      await vi.advanceTimersByTimeAsync(idleMs);
      await vi.waitFor(() => expect(refusals).toHaveLength(1));
      net.addPlace();
      await vi.advanceTimersByTimeAsync(idleMs);
      await reported.claim(issued("draft-1", "draftPetrinautExperiment"));

      expect(server.sent).toHaveLength(1);
      expect(refusals).toEqual([
        expect.objectContaining({ status, reason: JSON.stringify(error) }),
      ]);
      stop();
    },
  );

  test("started on a conversation that last showed the model an earlier revision, the reporter reports the document's at once", async () => {
    const net = openDocument();
    const server = serverAnswering(admitted);
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
      readShown: async () => "revision-before-the-reload",
    });

    const stop = reporter.start();

    await vi.waitFor(() =>
      expect(server.sent.map(({ body }) => body?.revision)).toEqual([
        net.revision(),
      ]),
    );
    await vi.advanceTimersByTimeAsync(idleMs * 2);
    expect(server.sent).toHaveLength(1);
    stop();
  });

  test("started on a conversation that last showed the model the document's revision, the reporter reports only a later edit", async () => {
    const net = openDocument();
    const server = serverAnswering(admitted);
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
      readShown: async () => net.revision(),
    });
    const stop = reporter.start();
    const reported = reporter.reportAround(browserCalls());

    await reported.claim(issued("draft-1", "draftPetrinautExperiment"));
    expect(server.sent).toHaveLength(0);

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs);
    await vi.waitFor(() =>
      expect(server.sent.map(({ body }) => body?.revision)).toEqual([
        net.revision(),
      ]),
    );
    stop();
  });

  test("an edit made while the reporter reads what the model was shown is reported against that", async () => {
    const net = openDocument();
    const server = serverAnswering(admitted);
    const shown = net.revision();
    let answerShown: (revision: string | undefined) => void = () => {};
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
      readShown: () =>
        new Promise((resolve) => {
          answerShown = resolve;
        }),
    });
    const stop = reporter.start();

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs);
    expect(server.sent).toHaveLength(0);
    answerShown(shown);

    await vi.waitFor(() =>
      expect(server.sent.map(({ body }) => body?.revision)).toEqual([
        net.revision(),
      ]),
    );
    stop();
  });

  test("a reporter that cannot read what the model was shown starts from the document", async () => {
    const net = openDocument();
    const server = serverAnswering(admitted);
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
      readShown: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const stop = reporter.start();
    const reported = reporter.reportAround(browserCalls());

    await reported.claim(issued("draft-1", "draftPetrinautExperiment"));
    expect(server.sent).toHaveLength(0);

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs);
    await vi.waitFor(() => expect(server.sent).toHaveLength(1));
    stop();
  });

  test("a report whose answer was lost is sent again under the same identity", async () => {
    const net = openDocument();
    let failing = true;
    const server = serverAnswering((body) => {
      if (failing) throw new TypeError("Failed to fetch");
      return admitted(body);
    });
    const reporter = createHandEditReporter({
      conversation: { ...conversation, fetch: server.fetch },
      documentId,
      document: net.document,
      idleMs,
    });
    const stop = reporter.start();
    const reported = reporter.reportAround(browserCalls());

    net.addPlace();
    await vi.advanceTimersByTimeAsync(idleMs);
    await vi.waitFor(() => expect(server.sent).toHaveLength(1));
    failing = false;
    await reported.claim(issued("draft-1", "draftPetrinautExperiment"));

    const [lost, resent] = server.sent.map(({ body }) => body);
    expect(resent).toEqual(lost);
    stop();
  });
});

/** A call the server issued to this tab. */
const issued = (toolCallId: string, toolName: string) => ({
  toolCallId,
  toolName,
  input: {},
  signal: new AbortController().signal,
});

/** The panel's browser calls, recording what was claimed; `holdNext` keeps the next run open. */
const browserCalls = () => {
  const claimed: string[] = [];
  let hold:
    | { readonly entered: () => void; readonly released: Promise<void> }
    | undefined;
  return {
    claimed,
    has: () => true,
    claim: async ({ toolCallId }: ReturnType<typeof issued>) => {
      claimed.push(toolCallId);
      return { toolCallId };
    },
    run: async (
      call: ReturnType<typeof issued>,
      execute: (input: unknown) => Promise<unknown>,
    ) => {
      claimed.push(call.toolCallId);
      const held = hold;
      hold = undefined;
      const output = execute(call.input);
      held?.entered();
      await held?.released;
      await output;
    },
    holdNext: () => {
      let release = () => {};
      let entered = () => {};
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      hold = { entered, released };
      return { started, release };
    },
  };
};
