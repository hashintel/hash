/** Built ChatAgent, faux provider, no browser: the current-net freshness marker on user turns. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
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

import { readPetrinautNetToolName } from "@hashintel/brunch-agent-plugin-sdcpn";
import { batchedConstructionMode } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  clientToolResultSignal,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";
import { BRUNCH_DOCUMENT_REVISION_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import {
  deriveNetFreshness,
  NET_STALE_SIGNAL,
} from "../../src/conversation/net-freshness.ts";
import { recordedBrowserObservation } from "../../src/conversation/net-ledger.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { createHeadlessPetrinautClient } from "../../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../../src/evaluations/runbook/load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "net-freshness-"));
process.env.NODE_ENV = "test";
process.env.HASH_OTLP_ENDPOINT = "";
process.env.OTEL_SDK_DISABLED = "true";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
globalThis.fetch = () => {
  throw new Error("External fetch forbidden");
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6" }],
});
installFauxProvider(faux.provider);
const application = await loadBuiltBrunchApplication();

const identity = {
  principalKey: "TEST-net-freshness",
  conversationId: `net-freshness-${crypto.randomUUID()}`,
};
const binding = {
  conversationId: identity.conversationId,
  documentId: "net-freshness-document",
  incarnationId: crypto.randomUUID(),
};
const host = createHeadlessPetrinautClient("Freshness net");
let reportedRevisionId: string | undefined = host.revisionId();
const createClient = () =>
  createFlueClient({
    url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: {
      ...agentOwnershipHeaders(identity),
      ...(reportedRevisionId === undefined
        ? {}
        : { [BRUNCH_DOCUMENT_REVISION_HEADER]: reportedRevisionId }),
    },
    fetch: async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      return application.fetch(request);
    },
  });
let client = createClient();
let userSubmission = 0;
const sendUser = (
  body: string,
  initialData?: Parameters<typeof client.send>[0]["initialData"],
) =>
  client.send({
    idempotencyKey: `net-freshness-user-${userSubmission++}`,
    ...(initialData === undefined ? {} : { initialData }),
    message: { kind: "user", body },
  });

/** The model-facing context of each turn, captured as the faux provider sees it. */
const contexts: string[] = [];
const capturing =
  (message: ReturnType<typeof fauxAssistantMessage>) => (context: Context) => {
    contexts.push(JSON.stringify(context));
    return message;
  };
const staleMarkersIn = (text: string): number =>
  text.split(`<${NET_STALE_SIGNAL}`).length - 1;
const executeRead = (toolCallId: string) =>
  host.execute({
    toolName: readPetrinautNetToolName,
    toolCallId,
    input: {},
  });
const deliverRead = async (toolCallId: string, completion: string) => {
  const read = await executeRead(toolCallId);
  const definition = host.definition();
  reportedRevisionId = host.revisionId();
  client = createClient();
  const observed = {
    definition,
    sha256: createHash("sha256")
      .update(JSON.stringify(definition))
      .digest("hex"),
    revisionId: reportedRevisionId,
  };
  faux.setResponses([capturing(fauxAssistantMessage([fauxText(completion)]))]);
  await client.wait(
    await client.send({
      message: clientToolResultSignal([
        {
          ...read,
          metadata: { observation: { toolCallId, binding, observed } },
        },
      ]),
    }),
  );
  return observed;
};

try {
  // Turn 1: the conversation has never read the net.
  faux.setResponses([
    capturing(
      fauxAssistantMessage(
        [fauxToolCall(readPetrinautNetToolName, {}, { id: "read-1" })],
        { stopReason: "toolUse" },
      ),
    ),
  ]);
  await client.wait(
    await sendUser("Explain this model.", {
      mode: batchedConstructionMode,
      construction: { binding },
    }),
  );
  const afterFirstTurn = await client.history();
  const firstStaleIndex = afterFirstTurn.messages.findIndex(
    (message) => message.signal?.tagName === NET_STALE_SIGNAL,
  );
  const firstAssistantIndex = afterFirstTurn.messages.findIndex(
    (message) => message.role === "assistant",
  );
  assert.notEqual(firstStaleIndex, -1, "turn 1 records the stale marker");
  assert(
    firstStaleIndex < firstAssistantIndex,
    "the marker is recorded before the model's first assistant message",
  );
  const firstMarker = afterFirstTurn.messages[firstStaleIndex]!;
  assert.equal(firstMarker.signal?.attributes?.kind, "never-read");
  assert.equal(contexts.length, 1);
  assert.equal(
    staleMarkersIn(contexts[0]!),
    1,
    "the model read exactly one marker on its first turn",
  );

  // The browser answers the read with its verified observation sidecar.
  const observed = await deliverRead("read-1", "GROUNDED_FROM_READ");
  assert.equal(
    staleMarkersIn(contexts[1]!),
    1,
    "the continuation adds no marker",
  );
  const afterRead = await client.history();
  const derivedAfterRead = await deriveNetFreshness(
    afterRead,
    { binding, construction: true },
    reportedRevisionId,
  );
  assert.deepEqual(
    derivedAfterRead,
    {
      kind: "current",
      hash: observed.sha256,
      revisionId: reportedRevisionId,
    },
    `read fixture must establish current state: ${JSON.stringify(
      derivedAfterRead,
    )}`,
  );

  // Turn 2: the last verified read is the latest recorded net.
  faux.setResponses([
    capturing(fauxAssistantMessage([fauxText("ANSWERED_FROM_CURRENT_READ")])),
  ]);
  await client.wait(await sendUser("And what does the first place hold?"));
  const afterSecondTurn = await client.history();
  assert.equal(
    afterSecondTurn.messages.filter(
      (message) => message.signal?.tagName === NET_STALE_SIGNAL,
    ).length,
    1,
    "a current read adds no second marker",
  );
  assert.equal(staleMarkersIn(contexts[2]!), 1);
  assert.equal(
    afterSecondTurn.messages.filter(
      (message) => message.role === "user" && message.purpose === "user",
    ).length,
    2,
    "each user turn is recorded once",
  );
  const projected = snapshotToUiMessages(afterSecondTurn, {
    clientToolNames: new Set([readPetrinautNetToolName]),
  });
  assert(
    !JSON.stringify(projected).includes(NET_STALE_SIGNAL),
    "the marker never reaches the UI projection",
  );
  assert.equal(
    projected.filter((message) => message.role === "user").length,
    2,
  );

  // A direct host edit has a Petrinaut revision but no Brunch mutation record.
  const revisionBeforeDirectEdit = host.revisionId();
  await host.execute({
    toolName: "addPlace",
    toolCallId: "direct-edit",
    input: {
      id: "direct-place",
      name: "DirectPlace",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  });
  assert.notEqual(host.revisionId(), revisionBeforeDirectEdit);
  reportedRevisionId = host.revisionId();
  client = createClient();
  faux.setResponses([
    capturing(fauxAssistantMessage([fauxText("REQUESTED_FRESH_READ")])),
  ]);
  await client.wait(await sendUser("Now explain the directly edited model."));
  const afterDirectEdit = await client.history();
  assert.equal(
    afterDirectEdit.messages.filter(
      (message) => message.signal?.tagName === NET_STALE_SIGNAL,
    ).length,
    2,
    "a direct Petrinaut revision adds a new stale marker before the model turn",
  );
  assert.equal(staleMarkersIn(contexts[3]!), 2);

  faux.setResponses([
    capturing(
      fauxAssistantMessage(
        [fauxToolCall(readPetrinautNetToolName, {}, { id: "read-2" })],
        { stopReason: "toolUse" },
      ),
    ),
  ]);
  await client.wait(await sendUser("Refresh after the direct edit."));
  await deliverRead("read-2", "REFRESHED_AFTER_DIRECT_EDIT");

  const definitionBeforeUndo = host.definition();
  const revisionBeforeUndo = host.revisionId();
  host.directEdit((draft) => {
    draft.places.push({
      id: "temporary-place",
      name: "TemporaryPlace",
      x: 1,
      y: 1,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    });
  });
  host.directEdit((draft) => {
    draft.places.splice(
      draft.places.findIndex(({ id }) => id === "temporary-place"),
      1,
    );
  });
  assert.deepEqual(host.definition(), definitionBeforeUndo);
  assert.notEqual(host.revisionId(), revisionBeforeUndo);
  reportedRevisionId = host.revisionId();
  client = createClient();
  faux.setResponses([
    capturing(fauxAssistantMessage([fauxText("REREAD_AFTER_UNDO_REQUIRED")])),
  ]);
  await client.wait(await sendUser("The edit was undone; rely on the net."));
  assert.equal(staleMarkersIn(contexts.at(-1)!), 4);

  faux.setResponses([
    capturing(
      fauxAssistantMessage(
        [fauxToolCall(readPetrinautNetToolName, {}, { id: "read-3" })],
        { stopReason: "toolUse" },
      ),
    ),
  ]);
  await client.wait(await sendUser("Refresh after the undo."));
  await deliverRead("read-3", "REFRESHED_AFTER_UNDO");

  reportedRevisionId = undefined;
  client = createClient();
  faux.setResponses([
    capturing(fauxAssistantMessage([fauxText("MISSING_REVISION_IS_STALE")])),
  ]);
  await client.wait(await sendUser("No revision confirmation is supplied."));
  assert.equal(staleMarkersIn(contexts.at(-1)!), 6);

  // Each submission and receipt must settle before testing the next binding.
  /* eslint-disable no-await-in-loop */
  for (const field of ["documentId", "incarnationId"] as const) {
    const toolCallId = `foreign-${field}-read`;
    reportedRevisionId = `foreign-${field}-revision`;
    client = createClient();
    faux.setResponses([
      capturing(
        fauxAssistantMessage(
          [fauxToolCall(readPetrinautNetToolName, {}, { id: toolCallId })],
          { stopReason: "toolUse" },
        ),
      ),
    ]);
    await client.wait(await sendUser(`Observe the net (${field} control).`));
    const read = await executeRead(toolCallId);
    const requestsBeforeForeignRead = faux.state.callCount;
    faux.setResponses([]);
    await assert.rejects(
      client.wait(
        await client.send({
          message: clientToolResultSignal([
            {
              ...read,
              metadata: {
                observation: {
                  toolCallId,
                  binding: { ...binding, [field]: `foreign-${field}` },
                  observed: {
                    definition: host.definition(),
                    sha256: createHash("sha256")
                      .update(JSON.stringify(host.definition()))
                      .digest("hex"),
                    revisionId: reportedRevisionId,
                  },
                },
              },
            },
          ]),
        }),
      ),
      /failed:.*internal error/u,
    );
    assert.equal(
      faux.state.callCount,
      requestsBeforeForeignRead,
      "A foreign observation must be rejected before model continuation",
    );
    const rejectedSnapshot = await client.history();
    await assert.rejects(
      () =>
        recordedBrowserObservation(rejectedSnapshot, { binding }, toolCallId),
      /another conversation or document incarnation/u,
    );
    // Definition/hash and reported revision agree; only the binding is foreign.
    assert.equal(
      (
        await deriveNetFreshness(
          await client.history(),
          { binding, construction: true },
          reportedRevisionId,
        )
      ).kind,
      "stale",
    );
    const before = staleMarkersIn(contexts.at(-1)!);
    faux.setResponses([
      capturing(
        fauxAssistantMessage([
          fauxText("FOREIGN_READ_CANNOT_ESTABLISH_FRESHNESS"),
        ]),
      ),
    ]);
    await client.wait(await sendUser("Rely on the current bound net."));
    assert.equal(staleMarkersIn(contexts.at(-1)!), before + 1);
  }
  /* eslint-enable no-await-in-loop */
  process.stdout.write(`NET_FRESHNESS_PASS ${directory}\n`);
} finally {
  host.dispose();
  await application.stop();
}
