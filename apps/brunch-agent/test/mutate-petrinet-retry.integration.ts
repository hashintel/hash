/** Rejected mutate_petrinet must not execute; the accepted retry must land a client-tool-result. */
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
  mutatePetrinetToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { browserResultFrom } from "./browser-result.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

const output = mkdtempSync(join(tmpdir(), "m7b-mutate-retry-"));
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
const app = await loadBuiltBrunchApplication();
const { server, browser, page, origin, deliveries, errors, blocked } =
  await openBrowserFixture(app, website);

const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const markdown =
  "# TEST queue fragment\n\nWork waits in Queue, then Start takes one item. Timing is unknown.";
const place = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

try {
  await page.goto(`${origin}/?brunchTracer=root-creation`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  faux.setResponses([
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
    (context: Context) => {
      const observation = browserResultFrom(
        context.messages.flatMap((message) =>
          typeof message.content === "string"
            ? [message.content]
            : message.content.flatMap((part) =>
                part.type === "text" ? [part.text] : [],
              ),
        ),
        "getLatestNetDefinition",
        "Missing observation",
      ).metadata?.observation;
      assert(observation);
      const locate = JSON.parse(
        context.messages
          .flatMap((message) =>
            message.role === "toolResult" &&
            message.toolName === "brunch_workpiece"
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
      const basis = {
        kind: "declared",
        revisionId: locate.currentWorkpiece.revisionId,
        sha256: locate.currentWorkpiece.sha256,
        locators: [span],
        rationale: "Synthetic test basis.",
        scope: "operation",
      };
      return tool(
        mutatePetrinetToolName,
        {
          observation: {
            toolCallId: observation.toolCallId,
            baseHash: observation.observed.sha256,
          },
          bases: [{ basisId: "queue-basis", basis }],
          operations: [
            {
              basisId: "queue-basis",
              operation: {
                operationId: "add-queue",
                type: "addPlace",
                input: place,
              },
            },
          ],
        },
        "batch-rejected",
      );
    },
    (context: Context) => {
      const rejected = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolCallId === "batch-rejected",
      );
      assert(rejected?.role === "toolResult" && rejected.isError);
      const observation = browserResultFrom(
        context.messages.flatMap((message) =>
          typeof message.content === "string"
            ? [message.content]
            : message.content.flatMap((part) =>
                part.type === "text" ? [part.text] : [],
              ),
        ),
        "getLatestNetDefinition",
        "Missing observation after rejection",
      ).metadata?.observation;
      assert(observation);
      const locate = JSON.parse(
        context.messages
          .flatMap((message) =>
            message.role === "toolResult" &&
            message.toolName === "brunch_workpiece"
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
      return tool(
        mutatePetrinetToolName,
        {
          observation: {
            toolCallId: observation.toolCallId,
            baseHash: observation.observed.sha256,
          },
          bases: [
            {
              basisId: "queue-basis",
              basis: {
                kind: "declared",
                revisionId: locate.currentWorkpiece.revisionId,
                sha256: locate.currentWorkpiece.sha256,
                locators: [span],
                rationale: "Synthetic test basis.",
                scope: "operation",
              },
            },
          ],
          operations: [
            {
              operationId: "add-queue",
              basisId: "queue-basis",
              type: "addPlace",
              input: place,
            },
          ],
        },
        "batch-accepted",
      );
    },
    fauxAssistantMessage([
      fauxText("Accepted mutate_petrinet retry completed."),
    ]),
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(
    "TEST synthetic account: work waits in Queue then Start takes one item. Timing is unknown.",
  );
  await composer.press("Enter");
  await page
    .getByText("Accepted mutate_petrinet retry completed.", { exact: true })
    .waitFor({ timeout: 60_000 });
  const stored = await page.evaluate(() => {
    const document = (
      JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
        string,
        {
          id: string;
          incarnationId: string;
          sdcpn: { places: { id: string }[] };
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
  const firstRequest = JSON.parse(deliveries[0]!.body) as {
    kind: string;
    initialData: { mode: string };
  };
  assert.equal(firstRequest.kind, "user");
  assert.equal(firstRequest.initialData.mode, batchedConstructionMode);
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const history = await client.history();
  const results = clientToolHistoryFrom(history.messages).results;
  save("history", history);
  save("results", results);
  assert.equal(
    results.some((result) => result.toolCallId === "batch-rejected"),
    false,
    "Rejected call must not produce a client-tool-result",
  );
  const accepted = results.find(
    (result) => result.toolCallId === "batch-accepted",
  );
  assert(accepted, "Accepted retry must land a client-tool-result");
  assert.equal(accepted.toolName, mutatePetrinetToolName);
  assert.equal(stored.document.sdcpn.places[0]?.id, "queue");
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write(
    `${JSON.stringify({
      output,
      mode: batchedConstructionMode,
      rejectedExecuted: false,
      acceptedResult: accepted.toolCallId,
    })}\n`,
  );
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  await app.stop();
}
