import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";

import { SCRATCH_PROJECT_CONSTRUCTION_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";

import {
  CLIENT_TOOL_RESULT_SIGNAL,
  isAwaitingClient,
} from "../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import {
  createHeadlessPetrinautClient,
  isPetrinautConstructionToolName,
} from "../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { CHAT_AGENT_ROUTE } from "../src/http/routes.ts";

const chatModelId = "claude-haiku-4-5";

process.env.BRUNCH_CHAT_MODEL = chatModelId;
process.env.BRUNCH_DEV_DB_PATH =
  process.env.BRUNCH_CHAT_DB_PATH ??
  join(tmpdir(), `brunch-scratch-${crypto.randomUUID()}.db`);

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: chatModelId, reasoning: true }],
});
setProvider(faux.provider);
faux.setResponses([
  fauxAssistantMessage(
    [
      fauxToolCall(
        "activate_skill",
        { name: "sdcpn-modelling" },
        { id: "activate-sdcpn" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [fauxToolCall("getLatestNetDefinition", {}, { id: "read-empty-scratch" })],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addPlace",
        {
          id: "orders_waiting",
          name: "OrdersWaiting",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 80,
          y: 160,
        },
        { id: "add-orders-waiting" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addPlace",
        {
          id: "orders_fulfilled",
          name: "OrdersFulfilled",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 520,
          y: 160,
        },
        { id: "add-orders-fulfilled" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addTransition",
        {
          id: "fulfill_order",
          name: "Fulfill order",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 300,
          y: 160,
        },
        { id: "add-fulfill-order" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addArc",
        {
          transitionId: "fulfill_order",
          arcDirection: "input",
          placeId: "orders_waiting",
          weight: 1,
        },
        { id: "connect-orders-waiting" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addArc",
        {
          transitionId: "fulfill_order",
          arcDirection: "output",
          placeId: "orders_fulfilled",
          weight: 1,
        },
        { id: "connect-orders-fulfilled" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage([
    fauxText(
      "The order flow is now visible in the open scratch project. I used an immediate predicate transition because no timing assumptions were supplied.",
    ),
  ]),
]);

const identity = {
  principalKey: "principal-scratch-project",
  conversationId: "conversation-scratch-project",
};
const instanceId = flueConversationIdFrom(identity);
const petrinautClient = createHeadlessPetrinautClient("New Process");
const application = await loadBuiltBrunchApplication();

try {
  const appTransport: typeof fetch = async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    );
  const client = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
    fetch: appTransport,
    headers: agentOwnershipHeaders(identity),
  });
  const firstAdmission = await client.send({
    initialData: { mode: SCRATCH_PROJECT_CONSTRUCTION_MODE },
    idempotencyKey: "scratch-project:user-1",
    message: {
      kind: "user",
      body: [
        "Build this small process in the open scratch project using sensible defaults.",
        "Orders wait to be fulfilled. Fulfillment moves one order from waiting to fulfilled.",
      ].join("\n"),
    },
  });
  await client.wait(firstAdmission);

  const completedCallIds = new Set<string>();
  const serviceClientCalls = async (clientRound = 0): Promise<void> => {
    if (clientRound >= 10) return;
    const snapshot = await client.history();
    const pendingCalls = snapshot.messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        if (
          part.type !== "dynamic-tool" ||
          !isPetrinautConstructionToolName(part.toolName) ||
          completedCallIds.has(part.toolCallId) ||
          part.state !== "output-available" ||
          !isAwaitingClient(part.output)
        ) {
          return [];
        }
        return [
          {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          },
        ];
      }),
    );
    if (pendingCalls.length === 0) return;

    const results = await Promise.all(
      pendingCalls.map((pendingCall) => petrinautClient.execute(pendingCall)),
    );
    for (const result of results) completedCallIds.add(result.toolCallId);
    const admission = await client.send({
      idempotencyKey: `scratch-project:tools:${results
        .map(({ toolCallId }) => toolCallId)
        .join(",")}`,
      message: {
        kind: "signal",
        type: CLIENT_TOOL_RESULT_SIGNAL,
        tagName: CLIENT_TOOL_RESULT_SIGNAL,
        body: JSON.stringify(results),
      },
    });
    await client.wait(admission);
    await serviceClientCalls(clientRound + 1);
  };
  await serviceClientCalls();

  const definition = petrinautClient.definition();
  const transition = definition.transitions.find(
    ({ id }) => id === "fulfill_order",
  );
  const snapshot = await client.history();
  const toolNames = snapshot.messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === "dynamic-tool" ? [part.toolName] : [],
    ),
  );
  const failedCalls = snapshot.messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === "dynamic-tool" && part.state === "output-error"
        ? [part.toolCallId]
        : [],
    ),
  );

  process.stdout.write(
    `SCRATCH_PROJECT_CONSTRUCTION_RESULT ${JSON.stringify({
      completedCallIds: [...completedCallIds],
      failedCalls,
      inputArcCount: transition?.inputArcs.length ?? 0,
      outputArcCount: transition?.outputArcs.length ?? 0,
      parseOk: petrinautClient.parse().ok,
      placeIds: definition.places.map(({ id }) => id),
      toolNames,
      transitionIds: definition.transitions.map(({ id }) => id),
    })}\n`,
  );
} finally {
  petrinautClient.dispose();
  await application.stop();
}
