/** Unpaid premises through the built ChatAgent and its mounted HTTP route. */
/* eslint-disable no-await-in-loop -- Cases share one faux-provider response queue; execution order is itself a premise. */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
  type Provider,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import { createFlueClient, type FlueConversationSnapshot } from "@flue/sdk";

import { VALIDATED_CONSTRUCTION_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";

import { isAwaitingClient } from "../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { createHeadlessPetrinautClient } from "../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { CHAT_AGENT_ROUTE } from "../src/http/routes.ts";

import type { PetrinautAiToolInput } from "@hashintel/petrinaut-core/ai";

const runId = `a2-faux-${crypto.randomUUID()}`;
const outputDirectory =
  process.env.A2_OUTPUT_DIRECTORY ?? join(tmpdir(), runId);
mkdirSync(outputDirectory, { recursive: true });
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(outputDirectory, "conversation.db");
const save = (name: string, value: unknown) =>
  writeFileSync(
    join(outputDirectory, name),
    `${JSON.stringify(value, null, 2)}\n`,
  );
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
const contexts: Context[] = [];
const provider: Provider = {
  ...faux.provider,
  stream() {
    throw new Error("Expected production streamSimple");
  },
  streamSimple(model, context, options) {
    contexts.push(context);
    return faux.provider.streamSimple(model, context, options);
  },
};
setProvider(provider);
const toolsFrom = (snapshot: FlueConversationSnapshot) =>
  snapshot.messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === "dynamic-tool" ? [part] : [],
    ),
  );
const markdown = "  # Synthetic account\r\n\nTiming remains unknown.  ";
const probe = async () => {
  let application = await loadBuiltBrunchApplication();
  const clientFor = (suffix: string) => {
    const identity = {
      principalKey: "a2-isolated-principal",
      conversationId: `${runId}-${suffix}`,
    };
    return createFlueClient({
      url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${flueConversationIdFrom(identity)}`,
      headers: agentOwnershipHeaders(identity),
      fetch: async (input, init) =>
        application.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
    });
  };
  try {
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(
            "update_workpiece",
            { markdown },
            { id: "settled-revision" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("Synthetic revision recorded.")]),
    ]);
    const client = clientFor("settled");
    await client.wait(
      await client.send({
        message: {
          kind: "user",
          body: "Record this test-authored synthetic account; no operational facts are claimed.",
        },
      }),
    );
    const settled = await client.history();
    save("settled-history.json", settled);
    await application.stop();
    application = await loadBuiltBrunchApplication();
    const reopened = await clientFor("settled").history();
    save("reopened-history.json", reopened);
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(
            "update_workpiece",
            { markdown: "# Second synthetic account" },
            { id: "second-revision" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("Second synthetic revision recorded.")]),
    ]);
    await client.wait(
      await client.send({
        message: { kind: "user", body: "Record a second synthetic revision." },
      }),
    );
    const second = await client.history();
    save("second-history.json", second);

    const mixed = [];
    for (const names of [
      ["brunch_mark_question", "addType"],
      ["update_workpiece", "addType"],
      ["brunch_mark_question", "update_workpiece", "addType"],
      ["addType", "update_workpiece", "brunch_mark_question"],
    ]) {
      const caseId = names.join("-");
      const typeInput = {
        id: "synthetic-type",
        name: "SyntheticType",
        iconSlug: "circle",
        displayColor: "#808080",
        elements: [],
      } satisfies PetrinautAiToolInput<"addType">;
      const generated = names.map((name) =>
        fauxToolCall(
          name,
          name === "addType"
            ? typeInput
            : name === "update_workpiece"
              ? { markdown }
              : { question: "What remains unknown?" },
          { id: `${caseId}-${name}` },
        ),
      );
      const contextStart = contexts.length;
      faux.setResponses([
        fauxAssistantMessage(generated, { stopReason: "toolUse" }),
        fauxAssistantMessage([
          fauxText(
            "Server continued before any browser result. What remains unknown?",
          ),
        ]),
      ]);
      const mixedClient = clientFor(caseId);
      await mixedClient.wait(
        await mixedClient.send({
          initialData: { mode: VALIDATED_CONSTRUCTION_MODE },
          message: {
            kind: "user",
            body: "Unpaid test-authored mixed-batch safety probe.",
          },
        }),
      );
      const history = await mixedClient.history();
      save(`${caseId}-history.json`, history);
      const pending = toolsFrom(history).filter(
        (part) =>
          part.toolName === "addType" &&
          part.state === "output-available" &&
          isAwaitingClient(part.output),
      );
      // Exercise the existing real-headless executor, not a fabricated applied:true.
      // This is a counterexample to server admission safety, NOT an actual browser witness.
      const headless = createHeadlessPetrinautClient(`A2 isolated ${caseId}`);
      try {
        const before = structuredClone(headless.definition());
        const results = [];
        for (const call of pending)
          results.push(
            await headless.execute({
              toolName: call.toolName,
              toolCallId: call.toolCallId,
              input: call.input,
            }),
          );
        const after = structuredClone(headless.definition());
        mixed.push({
          caseId,
          generated,
          tools: toolsFrom(history),
          providerCallsBeforeClientResult: contexts.length - contextStart,
          pendingMutationIds: pending.map((call) => call.toolCallId),
          results,
          before,
          after,
          mutationApplied: after.types.length !== before.types.length,
          actualBrowserApplied: null,
        });
      } finally {
        headless.dispose();
      }
    }
    return {
      markdown,
      settled: toolsFrom(settled),
      reopened: toolsFrom(reopened),
      second: toolsFrom(second),
      mixed,
    };
  } finally {
    await application.stop();
  }
};
export type WorkpieceRevisionProbeResult = Awaited<ReturnType<typeof probe>>;
try {
  const result = await probe();
  save("observations.json", result);
  save("contexts.json", contexts);
  process.stdout.write(
    `WORKPIECE_REVISIONS ${JSON.stringify({ ...result, outputDirectory })}\n`,
  );
} catch (error) {
  save("error.json", { error: String(error) });
  throw error;
}
