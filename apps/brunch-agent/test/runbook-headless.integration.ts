import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";

import { VALIDATED_CONSTRUCTION_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";

import {
  CLIENT_TOOL_RESULT_SIGNAL,
  isAwaitingClient,
} from "../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { deriveProofTrace } from "../src/evaluations/persona/proof-artifacts.ts";
import {
  interviewerToolNamesFrom,
  skillResourcePathsFrom,
} from "../src/evaluations/runbook/artifacts.ts";
import {
  createHeadlessPetrinautClient,
  isPetrinautConstructionToolName,
} from "../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { CHAT_AGENT_ROUTE } from "../src/http/routes.ts";

const CHAT_MODEL_ID = "claude-haiku-4-5";
const RUNBOOK_SKILL_NAME = "sdcpn-modelling";
const READ_SKILL_RESOURCE_TOOL_NAME = "read_skill_resource";
const RUNBOOK_RESOURCE_FILES = [
  "references/pn-construction.md",
  "references/checks.md",
] as const;

process.env.BRUNCH_CHAT_MODEL = CHAT_MODEL_ID;
process.env.BRUNCH_DEV_DB_PATH =
  process.env.BRUNCH_CHAT_DB_PATH ??
  join(tmpdir(), `brunch-runbook-${crypto.randomUUID()}.db`);

const irPath = fileURLToPath(
  new URL("./fixtures/candidate-process-model-workpiece.md", import.meta.url),
);
const filledIr = await readFile(irPath, "utf8");

const packagedSkillResourcePathFrom = (
  context: unknown,
  fileName: string,
): string => {
  const serialized = JSON.stringify(context);
  const match = serialized.match(
    new RegExp(
      `/\\.flue/packaged-skills/[^"\\s\\\\]+/${fileName.replace(".", "\\.")}`,
    ),
  );
  if (match === null) {
    throw new Error(`activate_skill briefing did not advertise ${fileName}`);
  }
  return match[0];
};

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: CHAT_MODEL_ID, reasoning: true }],
});
setProvider(faux.provider);

faux.setResponses([
  fauxAssistantMessage(
    [
      fauxToolCall(
        "activate_skill",
        { name: RUNBOOK_SKILL_NAME },
        { id: "activate-skill" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  ...RUNBOOK_RESOURCE_FILES.map(
    (resourceFile) => (context: unknown) =>
      fauxAssistantMessage(
        [
          fauxToolCall(
            READ_SKILL_RESOURCE_TOOL_NAME,
            { path: packagedSkillResourcePathFrom(context, resourceFile) },
            { id: `read-${resourceFile}` },
          ),
        ],
        { stopReason: "toolUse" },
      ),
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "getLatestNetDefinition",
        {},
        { id: "get-definition-before" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addType",
        {
          id: "order_type",
          name: "Order",
          iconSlug: "circle",
          displayColor: "#808080",
          elements: [],
        },
        { id: "add-type" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addParameter",
        {
          id: "washdown_hours",
          name: "Washdown hours",
          variableName: "washdown_hours",
          type: "real",
          defaultValue: "3",
        },
        { id: "add-parameter" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addPlace",
        {
          id: "line_idle",
          name: "LineIdle",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
        { id: "add-place" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addTransition",
        {
          id: "start_run",
          name: "Start run",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "return true;",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
        { id: "add-transition" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addArc",
        {
          transitionId: "start_run",
          arcDirection: "input",
          placeId: "line_idle",
          weight: 0,
        },
        { id: "add-invalid-arc" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addArc",
        {
          transitionId: "start_run",
          arcDirection: "input",
          placeId: "line_idle",
          weight: 1,
        },
        { id: "add-corrected-arc" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "addArc",
        {
          transitionId: "start_run",
          arcDirection: "output",
          placeId: "line_idle",
          weight: 1,
        },
        { id: "add-output-arc" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall(
        "getLatestNetDefinition",
        {},
        { id: "get-definition-after" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage([
    fauxText(
      [
        "The mounted tools accepted and returned a minimal self-loop, but it does not yet represent the workpiece's reservation interval. Behavior was not executed or tested.",
        "",
        "```runbook-ir",
        filledIr,
        "",
        "## Construction update",
        "",
        "**Agent construction finding:** tool-schema acceptance was reached for a minimal place/transition/arc path.",
        "",
        "**Target-representation loss:** the constructed self-loop does not preserve crew unavailability between final inspection and sign-off, so structural correspondence with the workpiece was not established.",
        "",
        "## Delivery update",
        "",
        "Net status: tool-schema accepted; structural correspondence not established; behavior untested.",
        "```",
      ].join("\n"),
    ),
  ]),
]);

const identity = {
  principalKey: "principal-runbook-headless",
  conversationId: "conversation-runbook-headless",
};
const instanceId = flueConversationIdFrom(identity);
const petrinautClient = createHeadlessPetrinautClient(
  "Validated construction proof",
);
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
    initialData: { mode: VALIDATED_CONSTRUCTION_MODE },
    message: {
      kind: "user",
      body: [
        "Construct from this filled IR without interviewing or emitting pn-json.",
        filledIr,
      ].join("\n\n"),
    },
  });
  await client.wait(firstAdmission);

  const completedCallIds = new Set<string>();
  const serviceClientCalls = async (clientRound: number): Promise<number> => {
    if (clientRound >= 20) return clientRound;
    const snapshot = await client.history();
    const pendingCalls = snapshot.messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        if (part.type !== "dynamic-tool") return [];
        if (!isPetrinautConstructionToolName(part.toolName)) return [];
        if (completedCallIds.has(part.toolCallId)) return [];
        if (
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
    if (pendingCalls.length === 0) return clientRound;

    const results = await Promise.all(
      pendingCalls.map((pendingCall) => petrinautClient.execute(pendingCall)),
    );
    for (const result of results) completedCallIds.add(result.toolCallId);
    const admission = await client.send({
      message: {
        kind: "signal",
        type: CLIENT_TOOL_RESULT_SIGNAL,
        tagName: CLIENT_TOOL_RESULT_SIGNAL,
        body: JSON.stringify(results),
      },
    });
    await client.wait(admission);
    return serviceClientCalls(clientRound + 1);
  };
  await serviceClientCalls(0);

  const snapshot = await client.history();
  const validationRejections = snapshot.messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === "dynamic-tool" &&
      part.toolName === "addArc" &&
      part.state === "output-error"
        ? [part.errorText]
        : [],
    ),
  );
  const resourcePaths = skillResourcePathsFrom(snapshot);
  const activatedSkillNames = deriveProofTrace(snapshot).events.flatMap(
    (event) =>
      event.type === "activate" && event.outcome === "ok" ? [event.name] : [],
  );
  const assistantText = snapshot.messages
    .flatMap((message) => message.parts)
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
  const parsed = petrinautClient.parse();
  const definition = petrinautClient.definition();

  process.stdout.write(
    `RUNBOOK_HEADLESS_HERMETIC ${JSON.stringify({
      sourceIrUsed: filledIr.includes("dispatch crew remains unavailable"),
      parseOk: parsed.ok,
      placeCount: definition.places.length,
      transitionCount: definition.transitions.length,
      toolNames: interviewerToolNamesFrom(snapshot),
      activatedSkillNames,
      resourceFilesRead: RUNBOOK_RESOURCE_FILES.filter((resourceFile) =>
        resourcePaths.some((resourcePath) =>
          resourcePath.endsWith(resourceFile),
        ),
      ),
      validationRejections,
      emittedFreeFormPnJson: assistantText.includes("```pn-json"),
      emittedUpdatedWorkpiece: assistantText.includes("```runbook-ir"),
      evidenceLevelHonest:
        assistantText.includes("tool-schema accepted") &&
        assistantText.includes("structural correspondence not established") &&
        assistantText.includes("behavior untested"),
      userMessages: snapshot.messages.filter(
        (message) => message.purpose === "user",
      ).length,
      wroteCaptureStore: false,
    })}\n`,
  );
} finally {
  petrinautClient.dispose();
  await application.stop();
}
