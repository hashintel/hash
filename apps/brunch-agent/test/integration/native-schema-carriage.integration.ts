/** Built ChatAgent -> actual Anthropic adapter/SDK -> canonical native validation. No sockets. */
/* eslint-disable no-await-in-loop -- Two provider entrypoints and causally ordered turns are the oracle. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  joinedRootArcInputSchema,
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  validatedFixtureMutationMode,
  VALIDATED_CONSTRUCTION_MODE,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { ordinaryBrunchToolCatalogue } from "../../src/agents/chat-agent/tool-catalogue.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../../src/evaluations/runbook/load-built-application.ts";
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "../native-schema-provider.ts";

let networkAttempts = 0;
const forbidden = () => {
  networkAttempts++;
  throw new Error("External requests forbidden");
};
globalThis.fetch = forbidden;
http.request = forbidden;
https.request = forbidden;
net.Socket.prototype.connect = forbidden;
const output =
  process.env.M7_NATIVE_OUTPUT ??
  mkdtempSync(join(tmpdir(), "m7-native-mounted-"));
if (process.env.M7_NATIVE_OUTPUT) {
  assert(!existsSync(output), "Use a fresh evidence directory");
  mkdirSync(output, { recursive: true });
}
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const captures: NativeRequestCapture[] = [];
const contexts: Context[] = [];
const histories: unknown[] = [];
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
let selectedProvider = nativeSchemaProvider(faux.provider, captures, contexts);
installFauxProvider({
  ...selectedProvider,
  streamSimple: (model, context, options) =>
    selectedProvider.streamSimple(model, context, options),
});
const application = await loadBuiltBrunchApplication();
try {
  for (const method of ["stream", "streamSimple"] as const) {
    // Keep the built registration/admission decorator; select only the real SDK entrypoint.
    selectedProvider = nativeSchemaProvider(
      faux.provider,
      captures,
      contexts,
      method,
    );
    const mounted = application;
    {
      const identity = {
        principalKey: "native-synthetic",
        conversationId: `native-${method}-${crypto.randomUUID()}`,
      };
      const client = createFlueClient({
        url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
        headers: agentOwnershipHeaders(identity),
        fetch: async (input, init) =>
          mounted.fetch(
            input instanceof Request ? input : new Request(input, init),
          ),
      });
      const initialData = {
        mode: validatedFixtureMutationMode,
        browser: {
          binding: {
            conversationId: identity.conversationId,
            documentId: "synthetic-document",
            incarnationId: "synthetic-incarnation",
          },
          requestedBaseHash: "a".repeat(64),
        },
      };
      const arc = {
        transitionId: "transition",
        placeId: "place",
        arcDirection: "input",
        type: "standard",
        weight: "2",
        brunch: {
          basis: {
            kind: "absent",
            reason: "Synthetic validation control, no construction claim.",
          },
          requestedBaseHash: "a".repeat(64),
        },
      };
      faux.setResponses([
        fauxAssistantMessage(
          [
            fauxToolCall(
              "mutate_workpiece",
              {
                markdown:
                  "# Synthetic native validation controls\n\nNo operational testimony or construction claim.",
              },
              { id: `${method}-revision` },
            ),
          ],
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage([fauxText("Synthetic workpiece settled.")]),
      ]);
      await client.wait(
        await client.send({
          initialData,
          message: {
            kind: "user",
            body: "Settle this labelled synthetic workpiece before the root-arc controls.",
          },
        }),
      );
      for (const [label, invalid] of [
        ["boolean", { ...arc, weight: true }],
        [
          "endpoints",
          { ...arc, endpoint: { kind: "place", placeId: "other" } },
        ],
        ["output-type", { ...arc, arcDirection: "output", type: "read" }],
      ] as const) {
        const id = `${method}-${label}`;
        faux.setResponses([
          fauxAssistantMessage([fauxToolCall("addArc", invalid, { id })], {
            stopReason: "toolUse",
          }),
          fauxAssistantMessage([fauxText("Synthetic invalid input refused.")]),
        ]);
        await client.wait(
          await client.send({
            initialData,
            message: {
              kind: "user",
              body: "Synthetic native refusal control.",
            },
          }),
        );
        const history = await client.history();
        histories.push(history);
        const part = history.messages
          .flatMap((message) => message.parts)
          .find(
            (entry) => entry.type === "dynamic-tool" && entry.toolCallId === id,
          );
        assert(part?.type === "dynamic-tool");
        assert.equal(part.state, "output-error");
        assert(
          !JSON.stringify(part).includes("Tool addArc not found"),
          "Refusal must come from native validation, not an absent tool",
        );
        assert.deepEqual(part.input, invalid);
      }
      const beforeValid = captures.length;
      faux.setResponses([
        fauxAssistantMessage(
          [fauxToolCall("addArc", arc, { id: `${method}-valid` })],
          { stopReason: "toolUse" },
        ),
      ]);
      await client.wait(
        await client.send({
          message: {
            kind: "user",
            body: "Synthetic numeric-string normalization control.",
          },
        }),
      );
      assert.equal(
        captures.length,
        beforeValid + 1,
        "Terminating native arc must await a correlated browser result",
      );
      const history = await client.history();
      histories.push(history);
      const valid = history.messages
        .flatMap((message) => message.parts)
        .find(
          (entry) =>
            entry.type === "dynamic-tool" &&
            entry.toolCallId === `${method}-valid`,
        );
      assert(valid?.type === "dynamic-tool");
      assert.equal(valid.state, "output-available");
      assert.deepEqual(
        valid.input,
        arc,
        "Normalization must not rewrite raw history/basis",
      );
      assert.deepEqual(valid.output, { awaiting: "client" });

      const typeIdentity = {
        ...identity,
        conversationId: `${identity.conversationId}-type`,
      };
      const typeClient = createFlueClient({
        url: `http://brunch.local/agents/chat/${flueConversationIdFrom(typeIdentity)}`,
        headers: agentOwnershipHeaders(typeIdentity),
        fetch: async (input, init) =>
          mounted.fetch(
            input instanceof Request ? input : new Request(input, init),
          ),
      });
      const nested = {
        id: "type",
        name: "SyntheticType",
        iconSlug: "circle",
        displayColor: "#808080",
        elements: [{ elementId: "value", name: "value", type: "string" }],
      };
      faux.setResponses([
        fauxAssistantMessage(
          [fauxToolCall("addType", nested, { id: `${method}-type` })],
          { stopReason: "toolUse" },
        ),
      ]);
      await typeClient.wait(
        await typeClient.send({
          initialData: { mode: VALIDATED_CONSTRUCTION_MODE },
          message: {
            kind: "user",
            body: "Synthetic nested native type control.",
          },
        }),
      );
      const typeHistory = await typeClient.history();
      histories.push(typeHistory);
      const issuedType = typeHistory.messages
        .flatMap((message) => message.parts)
        .find(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolCallId === `${method}-type`,
        );
      assert(issuedType?.type === "dynamic-tool");
      assert.equal(issuedType.state, "output-available");
      assert.deepEqual(issuedType.input, nested);
      assert.deepEqual(issuedType.output, { awaiting: "client" });

      const batchIdentity = {
        ...identity,
        conversationId: `${identity.conversationId}-batch`,
      };
      const batchClient = createFlueClient({
        url: `http://brunch.local/agents/chat/${flueConversationIdFrom(batchIdentity)}`,
        headers: agentOwnershipHeaders(batchIdentity),
        fetch: async (input, init) =>
          mounted.fetch(
            input instanceof Request ? input : new Request(input, init),
          ),
      });
      faux.setResponses([
        fauxAssistantMessage([
          fauxText("Synthetic batched schema carriage control."),
        ]),
      ]);
      await batchClient.wait(
        await batchClient.send({
          initialData: {
            mode: batchedConstructionMode,
            construction: {
              binding: {
                conversationId: batchIdentity.conversationId,
                documentId: "synthetic-document",
                incarnationId: "synthetic-incarnation",
              },
            },
          },
          message: {
            kind: "user",
            body: "Synthetic batched schema carriage control.",
          },
        }),
      );
      histories.push(await batchClient.history());
    }
  }
  for (const method of ["stream", "streamSimple"] as const) {
    const requests = captures.filter((capture) => capture.method === method);
    assert(requests.length > 0);
    const ordinaryRequest = requests.find((request) =>
      request.serialized.tools.some(
        (tool) => tool.name === mutatePetrinetToolName,
      ),
    );
    assert(ordinaryRequest, `${method} must carry ordinary Brunch tools`);
    const mountedNames = ordinaryRequest.serialized.tools.map(
      (tool) => tool.name,
    );
    assert.equal(
      new Set(mountedNames).size,
      mountedNames.length,
      `${method} ordinary Brunch tools must have unique names`,
    );
    assert.deepEqual(
      mountedNames,
      ordinaryBrunchToolCatalogue.map(({ name }) => name),
      `${method} ordinary Brunch tools must match the checked catalogue`,
    );
    for (const name of ["addArc", "addType", mutatePetrinetToolName] as const) {
      const expected = (
        name === "addArc"
          ? joinedRootArcInputSchema
          : name === "addType"
            ? petrinautAiTools.addType.inputSchema
            : mutatePetrinetInputSchema
      )["~standard"].jsonSchema.input({ target: "draft-2020-12" });
      const tools = requests.flatMap((request) =>
        request.serialized.tools.filter((tool) => tool.name === name),
      );
      assert(tools.length > 0);
      // Headless mode also mounts its unchanged legacy addArc; inspect native joined arcs only.
      const nativeTools = tools.filter(
        (tool) =>
          name !== "addArc" ||
          JSON.stringify(tool.input_schema).includes('"brunch"'),
      );
      assert(
        nativeTools.length > 0,
        `${method} must carry mounted native ${name}, not just a legacy tool`,
      );
      for (const tool of nativeTools)
        assert.deepEqual(tool.input_schema, expected);
    }
  }
  assert.equal(networkAttempts, 0);
  process.stdout.write(
    `NATIVE_SCHEMA_CARRIAGE ${JSON.stringify({ passed: true, networkAttempts, syntheticSdkRequests: captures.length, output })}\n`,
  );
} finally {
  writeFileSync(
    join(output, "native-sdk-requests.json"),
    JSON.stringify(captures, null, 2),
  );
  writeFileSync(
    join(output, "histories.json"),
    JSON.stringify(histories, null, 2),
  );
  await application.stop();
}
