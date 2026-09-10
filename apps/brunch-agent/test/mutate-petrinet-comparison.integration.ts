/** Same 25-operation empty-net target through one batch versus 25 one-operation calls. */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  batchedConstructionMode,
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
  type MutatePetrinetOperation,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import {
  loadBuiltBrunchApplication,
  type BuiltBrunchApplication,
} from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { browserResultFrom } from "./browser-result.ts";
import { comparisonOperations } from "./comparison-operations.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

const output = mkdtempSync(join(tmpdir(), "m7b-mutate-comparison-"));
const save = (name: string, value: unknown) =>
  writeFileSync(join(output, `${name}.json`), JSON.stringify(value, null, 2));
const website = resolve(
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assert.equal(
    new URL(input instanceof Request ? input.url : String(input)).hostname,
    "127.0.0.1",
  );
  return fetchOriginal(input, init);
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
installFauxProvider(nativeSchemaProvider(faux.provider, [], []));

const markdown =
  "# TEST comparison fragment\n\nTen waiting places feed seven steps across eight arcs. Timing is unknown.";
const done = (kind: "batch" | "individual") =>
  kind === "batch"
    ? "Batch comparison completed."
    : "Individual comparison completed.";

const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });

const textsFrom = (context: Context) =>
  context.messages.flatMap((message) =>
    typeof message.content === "string"
      ? [message.content]
      : message.content.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
  );

const locateBasis = (context: Context) => {
  const locate = JSON.parse(
    context.messages
      .flatMap((message) =>
        message.role === "toolResult" && message.toolName === "brunch_workpiece"
          ? typeof message.content === "string"
            ? [message.content]
            : message.content.flatMap((part) =>
                part.type === "text" ? [part.text] : [],
              )
          : [],
      )
      .at(-1) ?? "{}",
  ) as {
    currentWorkpiece: { revisionId: string; sha256: string };
    locatorLookup: {
      queries: { occurrences: { start: number; end: number }[] }[];
    };
  };
  const span = locate.locatorLookup.queries[0]?.occurrences[0];
  assert(span);
  return {
    kind: "declared" as const,
    revisionId: locate.currentWorkpiece.revisionId,
    sha256: locate.currentWorkpiece.sha256,
    locators: [span],
    rationale: "Synthetic comparison basis.",
    scope: "operation" as const,
  };
};

const mutateCall = (
  context: Context,
  operations: readonly MutatePetrinetOperation[],
  id: string,
) => {
  const observation = browserResultFrom(
    textsFrom(context),
    "getLatestNetDefinition",
    "Missing observation",
  ).metadata?.observation;
  assert(observation);
  return tool(
    mutatePetrinetToolName,
    {
      observation: {
        toolCallId: observation.toolCallId,
        baseHash: observation.observed.sha256,
      },
      bases: [{ basisId: "comparison-basis", basis: locateBasis(context) }],
      operations,
    },
    id,
  );
};

const settle = [
  tool("update_workpiece", { markdown }, "revision-1"),
  (context: Context) => {
    const revision = context.messages.findLast(
      (message) =>
        message.role === "toolResult" &&
        message.toolName === "update_workpiece",
    );
    assert(revision?.role === "toolResult" && !revision.isError);
    return tool(
      "brunch_workpiece",
      { locateTexts: [markdown] },
      "revision-1-locate",
    );
  },
  (context: Context) => {
    const locate = context.messages.findLast(
      (message) =>
        message.role === "toolResult" &&
        message.toolName === "brunch_workpiece",
    );
    assert(locate?.role === "toolResult" && !locate.isError);
    return tool("getLatestNetDefinition", {}, "read-1");
  },
];

type RouteResult = {
  readonly kind: "batch" | "individual";
  readonly elapsedMs: number;
  readonly postHash: string;
  readonly mutateResults: number;
  readonly applied: number;
  readonly places: number;
  readonly transitions: number;
  readonly arcs: number;
};

const hashFrom = (output: unknown) => {
  assert(output !== null && typeof output === "object");
  const record = output as {
    postHash?: unknown;
    outcomes?: { status?: unknown }[];
  };
  assert(typeof record.postHash === "string");
  return {
    postHash: record.postHash,
    applied:
      record.outcomes?.filter((outcome) => outcome.status === "applied")
        .length ?? 0,
  };
};

const runRoute = async (
  app: BuiltBrunchApplication,
  kind: "batch" | "individual",
): Promise<RouteResult> => {
  const { server, browser, page, origin, deliveries, errors, blocked } =
    await openBrowserFixture(app, website);
  const first = comparisonOperations[0];
  assert(first);
  const rest = comparisonOperations.slice(1);
  faux.setResponses(
    kind === "batch"
      ? [
          ...settle,
          (context: Context) =>
            mutateCall(context, comparisonOperations, "batch-25"),
          fauxAssistantMessage([fauxText(done(kind))]),
        ]
      : [
          ...settle,
          (context: Context) => mutateCall(context, [first], "single-0"),
          ...rest.flatMap((operation, index) => [
            () => tool("getLatestNetDefinition", {}, `read-${index + 2}`),
            (context: Context) =>
              mutateCall(context, [operation], `single-${index + 1}`),
          ]),
          fauxAssistantMessage([fauxText(done(kind))]),
        ],
  );
  try {
    await page.goto(`${origin}/?brunchTracer=root-creation`);
    await page.getByRole("button", { name: "Skip tour" }).click();
    await page
      .getByRole("button", { name: "Show AI assistant", exact: true })
      .click();
    const composer = page.getByRole("textbox", {
      name: "Message AI assistant",
      exact: true,
    });
    const started = Date.now();
    await composer.fill(
      "TEST synthetic account: construct the ten-place seven-step comparison fragment. Timing is unknown.",
    );
    await composer.press("Enter");
    await page
      .getByText(done(kind), { exact: true })
      .waitFor({ timeout: kind === "batch" ? 60_000 : 180_000 });
    const elapsedMs = Date.now() - started;
    const stored = await page.evaluate(() => {
      const document = (
        JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
          string,
          {
            id: string;
            incarnationId: string;
            sdcpn: {
              places: { id: string }[];
              transitions: {
                id: string;
                inputArcs: unknown[];
                outputArcs: unknown[];
              }[];
            };
          }
        >
      )["synthetic-root-creation-v1"];
      const key = Object.keys(localStorage).find((entry) =>
        entry.includes("principal"),
      );
      if (!document || !key) throw new Error("Missing actual host binding");
      const raw = localStorage.getItem(key) ?? "";
      return {
        document,
        principalKey: raw.startsWith('"') ? (JSON.parse(raw) as string) : raw,
      };
    });
    const identity = {
      principalKey: stored.principalKey,
      conversationId: `root-creation-candidate-v1:${stored.document.incarnationId}`,
    };
    const firstDelivery = deliveries[0];
    assert(firstDelivery);
    const firstRequest = JSON.parse(firstDelivery.body) as {
      kind: string;
      initialData: { mode: string };
    };
    assert.equal(firstRequest.kind, "user");
    assert.equal(firstRequest.initialData.mode, batchedConstructionMode);
    const history = await createFlueClient({
      url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
      headers: agentOwnershipHeaders(identity),
    }).history();
    const results = clientToolHistoryFrom(history.messages).results.filter(
      (result) => result.toolName === mutatePetrinetToolName,
    );
    save(`${kind}-history`, history);
    save(`${kind}-results`, results);
    const last = results.at(-1);
    assert(last, `${kind} must land a mutate_petrinet client-tool-result`);
    const { postHash } = hashFrom(last.output);
    const applied = results.reduce(
      (count, result) => count + hashFrom(result.output).applied,
      0,
    );
    const arcs = stored.document.sdcpn.transitions.reduce(
      (count, transition) =>
        count + transition.inputArcs.length + transition.outputArcs.length,
      0,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, []);
    return {
      kind,
      elapsedMs,
      postHash,
      mutateResults: results.length,
      applied,
      places: stored.document.sdcpn.places.length,
      transitions: stored.document.sdcpn.transitions.length,
      arcs,
    };
  } finally {
    await browser.close();
    await new Promise<void>((closeDone, reject) =>
      server.close((error) => (error ? reject(error) : closeDone())),
    );
  }
};

assert.equal(comparisonOperations.length, 25);
mutatePetrinetInputSchema.parse({
  observation: { toolCallId: "read-1", baseHash: "a".repeat(64) },
  bases: [
    {
      basisId: "comparison-basis",
      basis: {
        kind: "declared",
        revisionId: "revision-1",
        sha256: "b".repeat(64),
        locators: [{ start: 0, end: 8 }],
        rationale: "Synthetic comparison basis.",
        scope: "operation",
      },
    },
  ],
  operations: comparisonOperations,
});
const app = await loadBuiltBrunchApplication();
try {
  const batch = await runRoute(app, "batch");
  const individual = await runRoute(app, "individual");
  assert.equal(batch.mutateResults, 1);
  assert.equal(batch.applied, 25);
  assert.equal(individual.mutateResults, 25);
  assert.equal(individual.applied, 25);
  assert.equal(batch.places, 10);
  assert.equal(batch.transitions, 7);
  assert.equal(batch.arcs, 8);
  assert.deepEqual(
    {
      places: individual.places,
      transitions: individual.transitions,
      arcs: individual.arcs,
    },
    { places: batch.places, transitions: batch.transitions, arcs: batch.arcs },
  );
  assert.equal(batch.postHash, individual.postHash);
  save("comparison", { batch, individual });
  console.log(JSON.stringify({ output, batch, individual }, null, 2));
} finally {
  await app.stop();
}
