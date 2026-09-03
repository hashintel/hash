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

import {
  PETRINAUT_FIXTURE_TOOL_NAMES,
  VALIDATED_FIXTURE_MUTATION_MODE,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";

import {
  CLIENT_TOOL_RESULT_SIGNAL,
  isAwaitingClient,
} from "../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import {
  createPreparedWorkpieceDelivery,
  recoverRunbookWorkpiece,
} from "../src/conversation/workpiece.ts";
import { createHeadlessPetrinautClient } from "../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { CHAT_AGENT_ROUTE } from "../src/http/routes.ts";

const modelId = "claude-haiku-4-5";
const dispatchCrewPlaceId = "dispatch_crew_available";
const startFinalInspectionTransitionId = "start_final_inspection";
const preparedBody = [
  "Fixture authorship: test-authored.",
  "```runbook-ir",
  "# Prepared revision",
  "",
  "Timing and recovery remain unresolved.",
  "```",
].join("\n");
const preparedDelivery = createPreparedWorkpieceDelivery({
  body: preparedBody,
  fixtureId: "crew-reservation-v1",
  revision: 0,
});

process.env.BRUNCH_CHAT_MODEL = modelId;
process.env.BRUNCH_DEV_DB_PATH =
  process.env.BRUNCH_CHAT_DB_PATH ??
  join(tmpdir(), `brunch-prepared-workpiece-${crypto.randomUUID()}.db`);

const provider = fauxProvider({
  provider: "anthropic",
  models: [{ id: modelId, reasoning: true }],
});
setProvider(provider.provider);
provider.setResponses([
  fauxAssistantMessage([
    fauxText(
      [
        "Preparation acknowledged.",
        "```runbook-ir",
        "# Echo that must not become a model revision",
        "```",
      ].join("\n"),
    ),
  ]),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "getLatestNetDefinition",
        {},
        { id: "fixture-read-before-mutation" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addArc",
        {
          transitionId: startFinalInspectionTransitionId,
          arcDirection: "input",
          placeId: dispatchCrewPlaceId,
          weight: 1,
        },
        { id: "fixture-add-reservation-arc" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage([
    fauxText(
      [
        "Confirmation incorporated while retaining the unknown.",
        "```runbook-ir",
        "# Model revision one",
        "",
        "The sole crew is reserved for final inspection and returned by sign-off.",
        "",
        "Timing and recovery remain unresolved.",
        "```",
      ].join("\n"),
    ),
  ]),
]);

const identity = {
  principalKey: "prepared-workpiece-test",
  conversationId: "prepared-workpiece-test",
};
const application = await loadBuiltBrunchApplication();
const petrinautClient = createHeadlessPetrinautClient(
  "Prepared crew reservation",
  {
    types: [],
    parameters: [],
    places: [
      {
        id: dispatchCrewPlaceId,
        name: "Dispatch crew available",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      },
    ],
    transitions: [
      {
        id: startFinalInspectionTransitionId,
        name: "Start final inspection",
        inputArcs: [],
        outputArcs: [],
        lambdaType: "predicate",
        lambdaCode: "",
        transitionKernelCode: "",
        x: 180,
        y: 0,
      },
    ],
    differentialEquations: [],
  },
);

try {
  const transport: typeof fetch = async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    );
  const client = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${flueConversationIdFrom(identity)}`,
    fetch: transport,
    headers: agentOwnershipHeaders(identity),
  });
  const preparationPrompt = {
    uid: null,
    initialData: { mode: VALIDATED_FIXTURE_MUTATION_MODE },
    ...preparedDelivery,
  } as const;
  const preparation = await client.send(preparationPrompt);
  await client.wait(preparation);
  const preparedSnapshot = await client.history();
  const recoveredPrepared = recoverRunbookWorkpiece(preparedSnapshot);

  const retry = await client.send(preparationPrompt);
  const afterRetry = await client.history();

  const confirmation = await client.send({
    message: {
      kind: "user",
      body: "Final inspection consumes the sole crew; sign-off returns it.",
    },
  });
  await client.wait(confirmation);
  const completedCallIds = new Set<string>();
  const serviceClientCalls = async (clientRound: number): Promise<void> => {
    if (clientRound >= 5) {
      throw new Error("Prepared fixture exceeded five client-tool rounds.");
    }
    const snapshot = await client.history();
    const pendingCalls = snapshot.messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        if (
          part.type !== "dynamic-tool" ||
          !PETRINAUT_FIXTURE_TOOL_NAMES.includes(
            part.toolName as (typeof PETRINAUT_FIXTURE_TOOL_NAMES)[number],
          ) ||
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
    const continuation = await client.send({
      message: {
        kind: "signal",
        type: CLIENT_TOOL_RESULT_SIGNAL,
        tagName: CLIENT_TOOL_RESULT_SIGNAL,
        body: JSON.stringify(results),
      },
    });
    await client.wait(continuation);
    await serviceClientCalls(clientRound + 1);
  };
  await serviceClientCalls(0);
  const revisedSnapshot = await client.history();
  const recoveredRevision = recoverRunbookWorkpiece(revisedSnapshot);

  process.stdout.write(
    `PREPARED_WORKPIECE_HERMETIC ${JSON.stringify({
      preparationSubmissionId: preparation.submissionId,
      retrySubmissionId: retry.submissionId,
      retryDeduplicated: retry.deduplicated === true,
      messageCountStableAcrossRetry:
        preparedSnapshot.messages.length === afterRetry.messages.length,
      prepared: recoveredPrepared,
      revision: recoveredRevision,
      clientToolCallIds: [...completedCallIds],
      dynamicTools: revisedSnapshot.messages.flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "dynamic-tool"
            ? [
                {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  state: part.state,
                  output: part.output,
                  errorText: part.errorText,
                },
              ]
            : [],
        ),
      ),
      targetArcAdded:
        petrinautClient
          .definition()
          .transitions.find(({ id }) => id === startFinalInspectionTransitionId)
          ?.inputArcs.some(
            (arc) =>
              arc.placeId === dispatchCrewPlaceId &&
              arc.type === "standard" &&
              arc.weight === 1,
          ) === true,
      preparedDispatchCount: revisedSnapshot.messages.filter(
        (message) =>
          message.role === "system" &&
          message.purpose === "dispatch" &&
          message.signal?.tagName === "prepared-fixture",
      ).length,
    })}\n`,
  );
} finally {
  petrinautClient.dispose();
  await application.stop();
}
