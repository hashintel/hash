/**
 * P5: sequential execution of a round with waiting browser tools.
 *
 * `query_basis` (the real tool) is marked `executionMode: "sequential"`. In
 * one round with a waiting net read it reads the browser-call records: does
 * it see the read's result, in either order? With several waiting browser
 * changes in the round, do they run one after another without deadlock, and
 * what latency does that add against a scripted browser?
 *
 * The read is `getLatestNetDefinition`, the read whose output carries the
 * definition `query_basis` looks elements up in (`readNetOutline` does not).
 */
import {
  type ConversationId,
  createRegistry,
  defineExtension,
  Harness,
  type JsonObject,
  MemoryStorage,
  type ToolExecutionMode,
} from "@earendil-works/pi-durable";
import { describe, expect, test } from "vitest";

import { createHostBinding } from "../../src/agent/host-binding";
import {
  bindBrowserDocument,
  browserCallExtension,
  type BrowserCallRecord,
  type BrowserCallResult,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "../../src/browser-call/browser-call";
import { createPetrinautBrowserToolsExtension } from "../../src/browser-call/petrinaut-browser-tools";
import { queryBasisTool } from "../../src/net-state/query-basis";
import {
  allEntries,
  calls,
  context,
  fauxAssistantMessage,
  recordingModel,
  resultEntry,
  textOf,
} from "./support";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const place = (id: string, name: string) => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});

const definition = {
  places: [place("place-dryer", "Dryer")],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const queryDryer: JsonObject = { selector: { kind: "place", name: "Dryer" } };

type BrowserLog = {
  readonly toolCallId: string;
  readonly pendingAt: number;
  readonly settledAt: number;
};

/**
 * A browser that answers every pending call after `delayMs`, one call at a
 * time per call ID, with what `respond` gives; `log` records when each call
 * was seen pending and when it was answered.
 */
const scriptedBrowser = (
  harness: Harness,
  conversationId: ConversationId,
  respond: (record: BrowserCallRecord) => {
    output: BrowserCallResult["output"];
    metadata?: BrowserCallResult["metadata"];
  },
  delayMs: number,
) => {
  const log: BrowserLog[] = [];
  const seen = new Set<string>();
  const state = { stopped: false };
  const handle = async (record: BrowserCallRecord, pendingAt: number) => {
    const claim = await claimBrowserCall(
      harness,
      conversationId,
      record.toolCallId,
      context,
    );
    if (claim === undefined) return;
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
    const { output, metadata } = respond(record);
    await finishBrowserCall(
      harness,
      {
        conversationId,
        toolCallId: record.toolCallId,
        toolName: claim.toolName,
        capability: claim.capability,
        canonicalInput: claim.input,
        output,
        metadata,
      },
      context,
    );
    log.push({
      toolCallId: record.toolCallId,
      pendingAt,
      settledAt: performance.now(),
    });
  };
  const running = (async () => {
    while (!state.stopped) {
      // eslint-disable-next-line no-await-in-loop -- A poll, one at a time.
      const doc = await harness.snapshot(
        BrowserCallsDoc,
        conversationId,
        context,
      );
      for (const record of Object.values(doc?.calls ?? {}))
        if (record.status === "pending" && !seen.has(record.toolCallId)) {
          seen.add(record.toolCallId);
          void handle(record, performance.now());
        }
      // eslint-disable-next-line no-await-in-loop -- Polling interval.
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
    }
  })();
  return {
    log,
    stop: async () => {
      state.stopped = true;
      await running;
    },
  };
};

let revision = 1;
/** Reads observe the current revision; each change moves it on and reads the net back. */
const browserAnswer = (
  record: BrowserCallRecord,
): {
  output: BrowserCallResult["output"];
  metadata?: BrowserCallResult["metadata"];
} => {
  if (record.toolName === "getLatestNetDefinition")
    return {
      output: { title: "Net", definition },
      metadata: { documentRevision: { before: `revision-${revision}` } },
    };
  const before = `revision-${revision}`;
  revision += 1;
  return {
    output: { applied: true },
    metadata: {
      documentRevision: { before, after: `revision-${revision}` },
      readBack: definition,
    },
  };
};

const run = async (
  responses: FauxResponseStep[],
  mode: ToolExecutionMode | undefined,
  delayMs = 20,
) => {
  revision = 1;
  const { models, model } = recordingModel(responses);
  const query =
    mode === undefined
      ? queryBasisTool
      : { ...queryBasisTool, executionMode: mode };
  const queryExtension = defineExtension({
    name: "probe.query",
    tools: [query],
  });
  const host = createHostBinding();
  const petrinautBrowserToolsExtension =
    createPetrinautBrowserToolsExtension(host);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(petrinautBrowserToolsExtension);
  registry.install(queryExtension);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  host.bind(harness);
  try {
    const root = await harness.root(context, {
      agent: {
        model,
        extensions: [petrinautBrowserToolsExtension, queryExtension],
      },
    });
    await harness.commit(
      (tx) =>
        bindBrowserDocument(tx, root.id, {
          conversationId: "c",
          documentId: "d",
        }),
      context,
    );
    const browser = scriptedBrowser(harness, root.id, browserAnswer, delayMs);
    const submission = await root.submit(
      { type: "input", content: "go" },
      context,
    );
    expect((await submission.wait(context)).status).toBe("done");
    await browser.stop();
    const entries = await allEntries(root);
    const records =
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {};
    return { entries, log: browser.log, records };
  } finally {
    await harness.close(context);
  }
};

const disposition = (
  entries: Awaited<ReturnType<typeof run>>["entries"],
  toolCallId: string,
) =>
  JSON.parse(textOf(resultEntry(entries, toolCallId)?.model?.[0])) as {
    disposition: string;
    readToolCallId?: string;
  };

describe("P5: a sequential query_basis in a round with a waiting read", () => {
  test("[read, query_basis] sequential: query_basis runs after the read settles and sees it", async () => {
    const { entries } = await run(
      [
        calls(
          ["getLatestNetDefinition", "read-1"],
          ["query_basis", "query-1", queryDryer],
        ),
        fauxAssistantMessage("done"),
      ],
      "sequential",
    );
    expect(disposition(entries, "query-1")).toMatchObject({
      disposition: "basis-absent",
      readToolCallId: "read-1",
    });
  });

  test("[query_basis, read] sequential: query_basis runs first and sees no view", async () => {
    const { entries } = await run(
      [
        calls(
          ["query_basis", "query-1", queryDryer],
          ["getLatestNetDefinition", "read-1"],
        ),
        fauxAssistantMessage("done"),
      ],
      "sequential",
    );
    expect(disposition(entries, "query-1")).toMatchObject({
      disposition: "not-found",
    });
  });

  test("[read, query_basis] parallel (control): query_basis answers before the browser does and sees no view", async () => {
    const { entries } = await run(
      [
        calls(
          ["getLatestNetDefinition", "read-1"],
          ["query_basis", "query-1", queryDryer],
        ),
        fauxAssistantMessage("done"),
      ],
      undefined,
    );
    expect(disposition(entries, "query-1")).toMatchObject({
      disposition: "not-found",
    });
  });
});

describe("P5: several waiting browser changes in a sequential round", () => {
  const changeRound = (mode: ToolExecutionMode | undefined) =>
    run(
      [
        calls(["getLatestNetDefinition", "read-1"]),
        calls(
          ["addPlace", "add-1", place("place-a", "A")],
          ["addPlace", "add-2", place("place-b", "B")],
          ["addPlace", "add-3", place("place-c", "C")],
          ["query_basis", "query-1", queryDryer],
        ),
        fauxAssistantMessage("done"),
      ],
      mode,
      40,
    );

  test("run one after another without deadlock; latency is the sum of the browser's times, against their maximum in parallel", async () => {
    const sequential = await changeRound("sequential");
    const parallel = await changeRound(undefined);
    const span = (log: readonly BrowserLog[], ids: readonly string[]) => {
      const rows = log.filter(({ toolCallId }) => ids.includes(toolCallId));
      return (
        Math.max(...rows.map(({ settledAt }) => settledAt)) -
        Math.min(...rows.map(({ pendingAt }) => pendingAt))
      );
    };
    const changes = ["add-1", "add-2", "add-3"];
    // Sequential: each change is issued only after the previous one settled.
    const order = sequential.log.filter(({ toolCallId }) =>
      changes.includes(toolCallId),
    );
    expect(order.map(({ toolCallId }) => toolCallId)).toEqual(changes);
    for (const [index, row] of order.slice(1).entries())
      expect(row.pendingAt).toBeGreaterThanOrEqual(order[index]!.settledAt);
    const sequentialMs = span(sequential.log, changes);
    const parallelMs = span(parallel.log, changes);
    expect(sequentialMs).toBeGreaterThan(3 * 40);
    expect(parallelMs).toBeLessThan(2 * 40);
    // Every change of the round is issued against the view at the issuing response: the read's revision,
    // though the first change has already moved the document by the time the second is issued.
    expect(
      changes.map((id) => sequential.records[id]?.expectedRevision),
    ).toEqual(["revision-1", "revision-1", "revision-1"]);
    // A sequential query_basis after the changes sees their read-backs.
    expect(disposition(sequential.entries, "query-1")).toMatchObject({
      disposition: "basis-absent",
      readToolCallId: "add-3",
    });
    process.stdout.write(
      `P5 latency, three waiting changes at 40 ms each: sequential ${sequentialMs.toFixed(0)} ms, parallel ${parallelMs.toFixed(0)} ms\n`,
    );
  });
});
