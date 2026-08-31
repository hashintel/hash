/**
 * Construct-only side-quest drive. A filled runbook IR is the sole modelling
 * input; the built production ChatAgent constructs through a headless
 * Petrinaut client and never emits free-form net JSON.
 *
 * Build first, then run:
 *   yarn turbo run build --filter @apps/brunch-agent
 *   yarn workspace @apps/brunch-agent runbook:headless
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { observe } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";

import { VALIDATED_CONSTRUCTION_MODE } from "./agents/chat-agent/tools/petrinaut-construction.ts";
import {
  CLIENT_TOOL_RESULT_SIGNAL,
  isAwaitingClient,
} from "./conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "./conversation/identity.ts";
import {
  createHeadlessPetrinautClient,
  isPetrinautConstructionToolName,
  type HeadlessPetrinautToolCall,
  type HeadlessPetrinautToolResult,
} from "./headless-petrinaut-client.ts";
import { CHAT_AGENT_ROUTE } from "./http/routes.ts";
import { loadBuiltBrunchApplication } from "./load-built-application.ts";
import {
  interviewerToolNamesFrom,
  skillResourcePathsFrom,
} from "./runbook-artifacts.ts";

import type { FlueConversationPart, FlueConversationSnapshot } from "@flue/sdk";

process.env.BRUNCH_CHAT_MODEL ??= "claude-sonnet-4-5";

const DOCUMENT_TITLE = "Coatings line scheduling";
const MAX_CLIENT_ROUNDS = Number(
  process.env.BRUNCH_RUNBOOK_CLIENT_ROUNDS ?? "80",
);

const irPath = fileURLToPath(
  new URL(
    "../../../libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-runbook-headless/runbook-headless-2026-08-28T11-03-53-683Z.ir.md",
    import.meta.url,
  ),
);
const defaultOutputDirectory = fileURLToPath(
  new URL(
    "../../../libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-runbook-headless/",
    import.meta.url,
  ),
);
const outputDirectory =
  process.env.BRUNCH_RUNBOOK_OUTPUT_DIR ?? defaultOutputDirectory;

const filledIr = await readFile(irPath, "utf8");
const conversationId = `runbook-validated-construction-${new Date()
  .toISOString()
  .replaceAll(/[:.]/gu, "-")}`;
const identity = {
  principalKey: "principal-runbook-validated-construction",
  conversationId,
};
const instanceId = flueConversationIdFrom(identity);
const dbFile = join(tmpdir(), `${conversationId}.db`);
process.env.BRUNCH_DEV_DB_PATH = dbFile;

const constructionRequest = [
  "Construct a Petrinaut net from the filled runbook IR below.",
  "The IR is the only modelling input: do not interview or ask follow-up questions.",
  "Activate the sdcpn-modelling skill, read its construction and check resources, and use the mounted validated Petrinaut tools.",
  "Do not emit a pn-json block or any other free-form net JSON.",
  "Finish by naming every inference, approximation, default, omission, unrepresentable fact, and still-open unknown.",
  "",
  filledIr.trim(),
].join("\n");

type TurnUsage = {
  readonly durationMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly cost?: number;
};

const turnUsage: TurnUsage[] = [];
const stopObserving = observe((event) => {
  if (event.type !== "turn") return;
  const usage = event.response.usage;
  turnUsage.push({
    ...(typeof event.durationMs === "number"
      ? { durationMs: event.durationMs }
      : {}),
    ...(usage
      ? {
          inputTokens: usage.input,
          outputTokens: usage.output,
          totalTokens: usage.totalTokens,
          cost: usage.cost.total,
        }
      : {}),
  });
});

const dynamicPartsFrom = (
  snapshot: FlueConversationSnapshot,
): Extract<FlueConversationPart, { type: "dynamic-tool" }>[] =>
  snapshot.messages.flatMap((message) =>
    message.parts.filter(
      (part): part is Extract<FlueConversationPart, { type: "dynamic-tool" }> =>
        part.type === "dynamic-tool",
    ),
  );

const pendingCallsFrom = (
  snapshot: FlueConversationSnapshot,
  completedCallIds: ReadonlySet<string>,
): HeadlessPetrinautToolCall[] =>
  dynamicPartsFrom(snapshot).flatMap((part) => {
    if (!isPetrinautConstructionToolName(part.toolName)) return [];
    if (completedCallIds.has(part.toolCallId)) return [];
    if (part.state !== "output-available" || !isAwaitingClient(part.output)) {
      return [];
    }
    return [
      {
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      },
    ];
  });

const validationRejectionsFrom = (snapshot: FlueConversationSnapshot) =>
  dynamicPartsFrom(snapshot).flatMap((part) =>
    isPetrinautConstructionToolName(part.toolName) &&
    part.state === "output-error"
      ? [
          {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            error: part.errorText,
          },
        ]
      : [],
  );

const latestAssistantTextFrom = (snapshot: FlueConversationSnapshot): string =>
  snapshot.messages
    .filter((message) => message.purpose === "assistant")
    .flatMap((message) =>
      message.parts.filter(
        (part): part is Extract<FlueConversationPart, { type: "text" }> =>
          part.type === "text",
      ),
    )
    .map((part) => part.text)
    .join("\n\n")
    .trim();

const totalFrom = (values: readonly (number | undefined)[]): number =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

await mkdir(outputDirectory, { recursive: true });

const petrinautClient = createHeadlessPetrinautClient(DOCUMENT_TITLE);
let application: Awaited<ReturnType<typeof loadBuiltBrunchApplication>> | null =
  null;

try {
  const loadedApplication = await loadBuiltBrunchApplication();
  application = loadedApplication;
  const appTransport: typeof fetch = async (input, init) =>
    loadedApplication.fetch(
      input instanceof Request ? input : new Request(input, init),
    );
  const client = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
    fetch: appTransport,
    headers: agentOwnershipHeaders(identity),
  });

  const firstAdmission = await client.send({
    initialData: { mode: VALIDATED_CONSTRUCTION_MODE },
    message: { kind: "user", body: constructionRequest },
  });
  await client.wait(firstAdmission);

  const completedCallIds = new Set<string>();
  const clientToolResults: HeadlessPetrinautToolResult[] = [];
  let stopReason = "settled";

  const serviceClientCalls = async (clientRound: number): Promise<number> => {
    if (clientRound >= MAX_CLIENT_ROUNDS) return clientRound;
    const snapshot = await client.history();
    const pendingCalls = pendingCallsFrom(snapshot, completedCallIds);
    if (pendingCalls.length === 0) return clientRound;

    const results = await Promise.all(
      pendingCalls.map((pendingCall) => petrinautClient.execute(pendingCall)),
    );
    for (const result of results) {
      completedCallIds.add(result.toolCallId);
      clientToolResults.push(result);
    }

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

  const clientRounds = await serviceClientCalls(0);
  const snapshot = await client.history();
  if (pendingCallsFrom(snapshot, completedCallIds).length > 0) {
    stopReason = "client-round-limit";
  }

  const parsed = petrinautClient.parse();
  const validationRejections = validationRejectionsFrom(snapshot);
  const callbackRejections = clientToolResults.filter(
    (result) => "applied" in result.output && result.output.applied === false,
  );
  const correctionClasses = [
    ...(validationRejections.length > 0 ? ["schema-validation"] : []),
    ...(callbackRejections.length > 0 ? ["client-callback"] : []),
  ];
  const toolNames = interviewerToolNamesFrom(snapshot);
  const resourcePaths = skillResourcePathsFrom(snapshot);
  const assistantText = latestAssistantTextFrom(snapshot);
  const definition = petrinautClient.definition();
  const searchableDefinition = JSON.stringify(definition).toLowerCase();
  const arcs = definition.transitions.flatMap((transition) => [
    ...transition.inputArcs,
    ...transition.outputArcs,
  ]);
  const changeoverCrewPlaceIds = new Set(
    definition.places
      .filter((place) => {
        const identity = `${place.id} ${place.name}`.toLowerCase();
        return identity.includes("changeover") && identity.includes("crew");
      })
      .map((place) => place.id),
  );
  const semanticInspection = {
    hasPlacesAndTransitions:
      definition.places.length > 0 && definition.transitions.length > 0,
    hasExclusiveLineModes: ["white", "tint", "specialty"].every((mode) =>
      searchableDefinition.includes(mode),
    ),
    hasReturnedChangeoverCrew: definition.transitions.some((transition) =>
      transition.inputArcs.some(
        (inputArc) =>
          inputArc.placeId !== undefined &&
          changeoverCrewPlaceIds.has(inputArc.placeId) &&
          transition.outputArcs.some(
            (outputArc) => outputArc.placeId === inputArc.placeId,
          ),
      ),
    ),
    hasLineProductRestrictions:
      searchableDefinition.includes("meridian") &&
      searchableDefinition.includes("ct-12") &&
      searchableDefinition.includes("ct-14"),
    hasDirectionalWashdowns:
      searchableDefinition.includes("white") &&
      searchableDefinition.includes("tint") &&
      searchableDefinition.includes("washdown"),
    hasOnlyPositiveArcWeights:
      arcs.length > 0 && arcs.every((arc) => arc.weight > 0),
    namesIrLossesAndUnknowns: [
      "vw-02",
      "idle",
      "breakdown",
      "commercial",
    ].every((term) => assistantText.toLowerCase().includes(term)),
  };
  const semanticFidelityOk = Object.values(semanticInspection).every(Boolean);
  const record = {
    startedAt: conversationId,
    interviewerModel: process.env.BRUNCH_CHAT_MODEL,
    sourceIrPath: irPath,
    documentTitle: DOCUMENT_TITLE,
    stopReason,
    clientRounds,
    toolNames,
    resourcePaths,
    clientToolResults,
    validationRejections,
    callbackRejections,
    correctionCount: validationRejections.length + callbackRejections.length,
    correctionClasses,
    definition,
    document: petrinautClient.document(),
    parse: parsed.ok
      ? { ok: true, hadMissingPositions: parsed.hadMissingPositions }
      : { ok: false, error: parsed.error },
    assistantText,
    semanticInspection,
    semanticFidelityOk,
    proofSatisfied: parsed.ok && semanticFidelityOk,
    noInterviewTurns: true,
    emittedFreeFormPnJson: assistantText.includes("```pn-json"),
    wroteCaptureStore: false,
    usage: {
      turns: turnUsage,
      inputTokens: totalFrom(turnUsage.map((turn) => turn.inputTokens)),
      outputTokens: totalFrom(turnUsage.map((turn) => turn.outputTokens)),
      totalTokens: totalFrom(turnUsage.map((turn) => turn.totalTokens)),
      cost: totalFrom(turnUsage.map((turn) => turn.cost)),
    },
    transcript: (
      await import("./conversation/transcript.ts")
    ).formatFlueTranscript(snapshot),
  };

  const artifactBase = `${outputDirectory}/${conversationId}`;
  await writeFile(
    `${artifactBase}.json`,
    `${JSON.stringify(record, null, 2)}\n`,
  );
  await writeFile(
    `${artifactBase}.md`,
    [
      `# Runbook validated construction ${conversationId}`,
      "",
      `- Parser accepted: ${record.parse.ok}`,
      `- Semantic fidelity accepted: ${record.semanticFidelityOk}`,
      `- Proof satisfied: ${record.proofSatisfied}`,
      `- Corrections: ${record.correctionCount} (${record.correctionClasses.join(", ") || "none"})`,
      `- Cost: ${record.usage.cost}`,
      `- Client rounds: ${record.clientRounds}`,
      "",
      record.transcript,
      "",
    ].join("\n"),
  );

  process.stdout.write(
    `RUNBOOK_VALIDATED_CONSTRUCTION_RESULT ${JSON.stringify({
      stopReason,
      parseOk: parsed.ok,
      semanticFidelityOk,
      proofSatisfied: record.proofSatisfied,
      correctionCount: record.correctionCount,
      correctionClasses,
      cost: record.usage.cost,
      clientRounds,
      toolNames,
      resourcePaths,
      emittedFreeFormPnJson: record.emittedFreeFormPnJson,
      wroteCaptureStore: false,
      artifactBase,
    })}\n`,
  );
} finally {
  petrinautClient.dispose();
  stopObserving();
  await application?.stop();
}
