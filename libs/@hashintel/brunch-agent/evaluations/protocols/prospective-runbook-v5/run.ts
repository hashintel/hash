/**
 * Mission 4 repaired architecture scoring campaign.
 *
 * This is intentionally separate from the immutable flat-prompt control and
 * the aborted v2 operational campaign.
 * Build first, then run one explicitly numbered replication:
 *   BRUNCH_RUNBOOK_REPLICATION=1 \
 *     yarn workspace @apps/brunch-agent runbook:elicit:architecture-v5
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { observe, setProvider } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../../../../../apps/brunch-agent/src/conversation/identity.ts";
import { formatFlueTranscript } from "../../../../../../apps/brunch-agent/src/conversation/transcript.ts";
import {
  interviewerToolNamesFrom,
  ordinaryElicitationViolationsFrom,
  recoverRunbookWorkpiece,
  skillResourcePathsFrom,
} from "../../../../../../apps/brunch-agent/src/evaluations/runbook/artifacts.ts";
import {
  assertApprovedHermeticModelModules,
  builtServerArtifactManifest,
  canonicalPath,
  rejectImmutableBaselineOutput,
  sha256,
} from "../../../../../../apps/brunch-agent/src/evaluations/runbook/campaign-integrity.ts";
import {
  type BuiltBrunchApplication,
  loadBuiltBrunchApplication,
} from "../../../../../../apps/brunch-agent/src/evaluations/runbook/load-built-application.ts";
import { CHAT_AGENT_ROUTE } from "../../../../../../apps/brunch-agent/src/http/routes.ts";

import type Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "@earendil-works/pi-ai";
import type { FlueConversationSnapshot } from "@flue/sdk";

const PROTOCOL_ID = "prospective-runbook-v5";
const OUTPUT_NAMESPACE_ID = "vestera-architecture-candidate-v5";
const COMPARISON_TARGET = {
  protocolId: "prospective-runbook-v1",
  outputNamespaceId: "vestera-prospective-baseline-v1",
  memberRunIds: [
    "runbook-elicitation-2026-08-31T10-50-28-709Z-20a4817f",
    "runbook-elicitation-2026-08-31T10-56-34-754Z-4b75737c",
  ],
  qualityPopulation: "valid-workpieces",
  runtimeAccounting: "reported-separately",
} as const;
const FROZEN_MODEL = "claude-sonnet-4-5";
const FROZEN_HARD_STOP = 8;
const FROZEN_LATENCY_STOP_MS = 180_000;
const FROZEN_REPLICATIONS = 3;

process.env["BRUNCH_CHAT_MODEL"] ??= FROZEN_MODEL;

const execFileAsync = promisify(execFile);
const repositoryRoot = new URL("../../../../../../", import.meta.url);
const repositoryRootPath = fileURLToPath(repositoryRoot);
const evaluationRoot = new URL("../../", import.meta.url);
const caseDirectory = new URL("cases/vestera-scheduling/", evaluationRoot);
const candidateOutputDirectory = fileURLToPath(
  new URL(
    "../../../docs/evidence/evaluations/vestera-architecture-candidate-v5/",
    import.meta.url,
  ),
);
const immutableBaselineDirectory = fileURLToPath(
  new URL(
    "../../../docs/evidence/evaluations/vestera-prospective-baseline-v1/",
    import.meta.url,
  ),
);

const interviewerModel = process.env["BRUNCH_CHAT_MODEL"];
const expertModel = process.env["BRUNCH_RUNBOOK_EXPERT_MODEL"] ?? FROZEN_MODEL;
const hardStop = Number(
  process.env["BRUNCH_RUNBOOK_HARD_STOP"] ?? `${FROZEN_HARD_STOP}`,
);
const latencyStopMs = Number(
  process.env["BRUNCH_RUNBOOK_LATENCY_STOP_MS"] ?? `${FROZEN_LATENCY_STOP_MS}`,
);
const replication = Number(process.env["BRUNCH_RUNBOOK_REPLICATION"] ?? "0");
const outputDirectory = await rejectImmutableBaselineOutput(
  process.env["BRUNCH_RUNBOOK_OUTPUT_DIR"] ?? candidateOutputDirectory,
  immutableBaselineDirectory,
);
const canonicalCandidateOutputDirectory = await canonicalPath(
  candidateOutputDirectory,
);
const expertClientModule = process.env["BRUNCH_RUNBOOK_ANTHROPIC_MODULE"];
const interviewerProviderModule =
  process.env["BRUNCH_RUNBOOK_INTERVIEWER_PROVIDER_MODULE"];
const allowDirtyInstrument =
  process.env["BRUNCH_RUNBOOK_ALLOW_DIRTY_INSTRUMENT"] === "1";
const apiKey = process.env["ANTHROPIC_API_KEY"];

if (!Number.isSafeInteger(hardStop) || hardStop < 1) {
  throw new Error("BRUNCH_RUNBOOK_HARD_STOP must be a positive integer");
}
if (!Number.isFinite(latencyStopMs) || latencyStopMs <= 0) {
  throw new Error("BRUNCH_RUNBOOK_LATENCY_STOP_MS must be positive");
}
if (
  !Number.isSafeInteger(replication) ||
  replication < 1 ||
  replication > FROZEN_REPLICATIONS
) {
  throw new Error(
    `BRUNCH_RUNBOOK_REPLICATION must be one of 1, 2, or ${FROZEN_REPLICATIONS}`,
  );
}

const hasExpertOverride = expertClientModule !== undefined;
const hasInterviewerOverride = interviewerProviderModule !== undefined;
if (hasExpertOverride !== hasInterviewerOverride) {
  throw new Error(
    "Hermetic runs must set both test-only model module overrides; paid runs must set neither.",
  );
}
const isHermeticRun = hasExpertOverride && hasInterviewerOverride;
const usesFrozenConfiguration =
  interviewerModel === FROZEN_MODEL &&
  expertModel === FROZEN_MODEL &&
  hardStop === FROZEN_HARD_STOP &&
  latencyStopMs === FROZEN_LATENCY_STOP_MS;

if (isHermeticRun) {
  await assertApprovedHermeticModelModules(repositoryRootPath, {
    expert: expertClientModule,
    interviewer: interviewerProviderModule,
  });
  if (outputDirectory === canonicalCandidateOutputDirectory) {
    throw new Error(
      "Hermetic runs cannot write to vestera-architecture-candidate-v5.",
    );
  }
  if (apiKey) {
    throw new Error("Hermetic runs must not receive ANTHROPIC_API_KEY.");
  }
} else {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for a paid candidate run.");
  }
  if (outputDirectory !== canonicalCandidateOutputDirectory) {
    throw new Error(
      "Paid candidate runs must write to vestera-architecture-candidate-v5.",
    );
  }
  if (!usesFrozenConfiguration) {
    throw new Error(
      "Paid candidate runs require the frozen prospective-runbook-v5 model, turn, and latency configuration.",
    );
  }
  if (allowDirtyInstrument) {
    throw new Error(
      "Paid candidate runs cannot use BRUNCH_RUNBOOK_ALLOW_DIRTY_INSTRUMENT.",
    );
  }
}

const instrumentFiles = [
  "yarn.lock",
  "apps/brunch-agent/package.json",
  "apps/brunch-agent/vite.config.ts",
  "apps/brunch-agent/src/app.ts",
  "apps/brunch-agent/src/db.ts",
  "apps/brunch-agent/src/agents/chat-agent/agent.ts",
  "apps/brunch-agent/src/agents/chat-agent/tools/ping.ts",
  "apps/brunch-agent/src/conversation/identity.ts",
  "apps/brunch-agent/src/conversation/transcript.ts",
  "apps/brunch-agent/src/http/routes.ts",
  "apps/brunch-agent/src/evaluations/runbook/artifacts.ts",
  "apps/brunch-agent/src/evaluations/runbook/campaign-integrity.ts",
  "apps/brunch-agent/src/evaluations/runbook/load-built-application.ts",
  "libs/@hashintel/brunch-agent/packages/core/package.json",
  "libs/@hashintel/brunch-agent/packages/core/src/SYSTEM.md",
  "libs/@hashintel/brunch-agent/packages/core/src/agent/index.ts",
  "libs/@hashintel/brunch-agent/packages/core/src/universal-elicitation.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/package.json",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/APPEND_SYSTEM.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/flue.ts",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/skill.ts",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/instructions.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/profile.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/workpiece-template.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/pn-construction.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/checks.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/tools/petrinaut-construction.ts",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/tools/read-petrinaut-doc.ts",
  "libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/opening-message.md",
  "libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/situation-pack.md",
  "libs/@hashintel/brunch-agent/evaluations/oracles/vestera-scheduling/truth-ledger-v1-prospective.yaml",
  "libs/@hashintel/brunch-agent/evaluations/oracles/ir-quality-ruler-v1.md",
  "libs/@hashintel/brunch-agent/evaluations/protocols/ir-quality-ruler-v1/omniscient-grader.md",
  "libs/@hashintel/brunch-agent/evaluations/protocols/ir-quality-ruler-v1/cold-ir-reviewer.md",
  "libs/@hashintel/brunch-agent/evaluations/protocols/mission-4-product-witness-v2/protocol.md",
  "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v5/protocol.md",
  "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v5/run.ts",
  "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v5/grade.ts",
  "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v5/score-report.ts",
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md",
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/runbook-elicitation-2026-08-31T10-50-28-709Z-20a4817f.ir.md",
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/runbook-elicitation-2026-08-31T10-50-28-709Z-20a4817f.omniscient.md",
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/runbook-elicitation-2026-08-31T10-50-28-709Z-20a4817f.cold.md",
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/runbook-elicitation-2026-08-31T10-56-34-754Z-4b75737c.ir.md",
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/runbook-elicitation-2026-08-31T10-56-34-754Z-4b75737c.omniscient.md",
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/runbook-elicitation-2026-08-31T10-56-34-754Z-4b75737c.cold.md",
] as const;

const hashedInstrumentFiles = await Promise.all(
  instrumentFiles.map(async (path) => ({
    path,
    hash: sha256(await readFile(new URL(path, repositoryRoot))),
  })),
);
const fileSha256: Record<string, string> = {};
for (const file of hashedInstrumentFiles) {
  fileSha256[file.path] = file.hash;
}

const { stdout: commitOutput } = await execFileAsync(
  "git",
  ["rev-parse", "HEAD"],
  { cwd: repositoryRootPath },
);
const sourceCommit = commitOutput.trim();
const { stdout: statusOutput } = await execFileAsync(
  "git",
  ["status", "--short", "--", ...instrumentFiles],
  { cwd: repositoryRootPath },
);
const instrumentStatus = statusOutput.trim();
if (instrumentStatus.length > 0 && !allowDirtyInstrument) {
  throw new Error(
    `Candidate instrument files are not clean:\n${instrumentStatus}\n` +
      "Commit them before a paid run. The dirty escape hatch is hermetic-test-only.",
  );
}
if (allowDirtyInstrument && !isHermeticRun) {
  throw new Error(
    "BRUNCH_RUNBOOK_ALLOW_DIRTY_INSTRUMENT is restricted to hermetic runs.",
  );
}

const builtArtifactManifest =
  await builtServerArtifactManifest(repositoryRootPath);
const builtArtifactManifestSha256 = sha256(
  JSON.stringify(builtArtifactManifest),
);
const campaignFingerprint = sha256(
  JSON.stringify({
    protocolId: PROTOCOL_ID,
    outputNamespaceId: OUTPUT_NAMESPACE_ID,
    comparisonTarget: COMPARISON_TARGET,
    interviewerModel,
    expertModel,
    hardStop,
    latencyStopMs,
    fileSha256,
    builtArtifactManifest,
  }),
);

interface ExistingCandidateRecord {
  readonly protocolId?: unknown;
  readonly outputNamespaceId?: unknown;
  readonly replication?: unknown;
  readonly campaignFingerprint?: unknown;
}

if (!isHermeticRun) {
  let existingNames: string[] = [];
  try {
    existingNames = await readdir(outputDirectory);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
  const existingRecords = await Promise.all(
    existingNames
      .filter((entry) => entry.endsWith(".json"))
      .map(async (name) => ({
        name,
        record: JSON.parse(
          await readFile(join(outputDirectory, name), "utf8"),
        ) as ExistingCandidateRecord,
      })),
  );
  for (const { name, record: existing } of existingRecords) {
    if (
      existing.protocolId !== PROTOCOL_ID ||
      existing.outputNamespaceId !== OUTPUT_NAMESPACE_ID
    ) {
      throw new Error(
        `Candidate output namespace contains a foreign JSON artifact: ${name}`,
      );
    }
    if (existing.campaignFingerprint !== campaignFingerprint) {
      throw new Error(
        `Candidate artifact ${name} used a different frozen instrument or configuration.`,
      );
    }
    if (existing.replication === replication) {
      throw new Error(
        `Candidate replication ${replication} already has an immutable artifact: ${name}`,
      );
    }
  }

  const AnthropicClient = (await import("@anthropic-ai/sdk")).default;
  await new AnthropicClient({
    apiKey,
    maxRetries: 0,
    timeout: 30_000,
  }).messages.create({
    model: expertModel,
    max_tokens: 1,
    thinking: { type: "disabled" },
    system:
      "Credential and model-availability preflight. Return one punctuation mark.",
    messages: [{ role: "user", content: "." }],
  });
}

const openingRaw = await readFile(
  new URL("opening-message.md", caseDirectory),
  "utf8",
);
const openingSeparator = openingRaw.indexOf("\n---\n");
const openingMessage = (
  openingSeparator === -1 ? openingRaw : openingRaw.slice(openingSeparator + 5)
).trim();
const situationPack = await readFile(
  new URL("situation-pack.md", caseDirectory),
  "utf8",
);
const finalizationMessage = [
  "[Evaluation stop instruction; not expert evidence]",
  "The interview turn budget is exhausted.",
  "Emit the full current Markdown runbook IR in one `runbook-ir` fenced block.",
  "Do not ask another question, construct the Petri net, or read construction resources.",
  "Preserve every unresolved unknown, not-yet-asked item, declined or deferred item, assumption, conflict, correction, contextual coexistence, omission, and loss.",
].join(" ");

interface ExpertMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

interface ExpertClient {
  messages: {
    create(request: Anthropic.MessageCreateParamsNonStreaming): Promise<{
      readonly content: readonly {
        readonly type: string;
        readonly text?: string;
      }[];
      readonly model?: string;
      readonly stop_reason?: string | null;
      readonly usage?: Partial<Anthropic.Usage>;
    }>;
  };
}

const defaultExportFrom = async <Value>(specifier: string): Promise<Value> => {
  const loaded: unknown = await import(specifier);
  if (typeof loaded !== "object" || loaded === null || !("default" in loaded)) {
    throw new Error(`${specifier} has no default export`);
  }
  return loaded.default as Value;
};

const latestAssistantText = (snapshot: FlueConversationSnapshot): string => {
  for (const message of snapshot.messages.toReversed()) {
    if (message.purpose !== "assistant") continue;
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text.length > 0) return text;
  }
  return "";
};

interface ModelCall {
  readonly durationMs: number;
  readonly providerId: string;
  readonly providerName: string;
  readonly api: string;
  readonly requestedModel: string;
  readonly observedModel: string | null;
  readonly observedModelSource: "provider-response" | "unavailable";
  readonly stopReason: string | null;
  readonly providerStopReason: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cost: number;
}

const unknownFailureMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  try {
    return JSON.stringify({ error });
  } catch {
    return "Unknown non-serializable failure";
  }
};

const failureFrom = (error: unknown) =>
  error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: "UnknownFailure", message: unknownFailureMessage(error) };

const startedAt = new Date().toISOString();
const runId = `${PROTOCOL_ID}-replication-${replication}-${startedAt.replaceAll(
  /[:.]/gu,
  "-",
)}-${randomUUID().slice(0, 8)}`;
const artifactBase = join(outputDirectory, runId);
const identity = {
  principalKey: `principal-${PROTOCOL_ID}`,
  conversationId: runId,
};
const instanceId = flueConversationIdFrom(identity);
const databasePath = join(tmpdir(), `${runId}.db`);
process.env["BRUNCH_DEV_DB_PATH"] = databasePath;
await mkdir(outputDirectory, { recursive: true });

const instrument = {
  sourceCommit,
  instrumentStatus,
  fileSha256,
  builtArtifactManifest,
  builtArtifactManifestSha256,
};
const campaignConfiguration = {
  interviewerModel,
  expertModel,
  hardStop,
  latencyStopMs,
};
const expertMessages: ExpertMessage[] = [];
const expertCalls: Array<{
  readonly requestedModel: string;
  readonly observedModel: string | null;
  readonly observedModelSource: "provider-response" | "unavailable";
  readonly stopReason: string | null;
}> = [];
const expertUsage = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
const modelCalls: ModelCall[] = [];
let application: BuiltBrunchApplication | undefined;
let stopObserving: (() => void) | undefined;
let history: (() => Promise<FlueConversationSnapshot>) | undefined;

try {
  if (interviewerProviderModule) {
    setProvider(await defaultExportFrom<Provider>(interviewerProviderModule));
  }

  const AnthropicClient = (await import("@anthropic-ai/sdk")).default;
  const expertClient: ExpertClient = expertClientModule
    ? await defaultExportFrom<ExpertClient>(expertClientModule)
    : (new AnthropicClient({
        apiKey,
        maxRetries: 5,
        timeout: 30 * 60 * 1000,
      }) as ExpertClient);

  const askExpert = async (interviewerText: string): Promise<string> => {
    expertMessages.push({ role: "user", content: interviewerText });
    const response = await expertClient.messages.create({
      model: expertModel,
      max_tokens: 1500,
      thinking: { type: "disabled" },
      system: situationPack,
      messages: expertMessages,
    });
    expertUsage.calls += 1;
    expertUsage.inputTokens += response.usage?.input_tokens ?? 0;
    expertUsage.outputTokens += response.usage?.output_tokens ?? 0;
    expertUsage.cacheReadTokens += response.usage?.cache_read_input_tokens ?? 0;
    expertUsage.cacheWriteTokens +=
      response.usage?.cache_creation_input_tokens ?? 0;
    expertCalls.push({
      requestedModel: expertModel,
      observedModel: response.model ?? null,
      observedModelSource:
        response.model === undefined ? "unavailable" : "provider-response",
      stopReason: response.stop_reason ?? null,
    });
    const text = response.content
      .filter(
        (block): block is { readonly type: "text"; readonly text: string } =>
          block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text.length === 0) {
      throw new Error("The simulated expert returned no text");
    }
    expertMessages.push({ role: "assistant", content: text });
    return text;
  };

  stopObserving = observe((event) => {
    if (event.type !== "turn") return;
    const usage = event.response.usage;
    modelCalls.push({
      durationMs: event.durationMs,
      providerId: event.request.providerId,
      providerName: event.request.providerName,
      api: event.request.api,
      requestedModel: event.request.requestedModel,
      observedModel: event.response.responseModel ?? null,
      observedModelSource:
        event.response.responseModel === undefined
          ? "unavailable"
          : "provider-response",
      stopReason: event.response.finishReason ?? null,
      providerStopReason: event.response.providerFinishReason ?? null,
      inputTokens: usage?.input ?? 0,
      outputTokens: usage?.output ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      cost: usage?.cost.total ?? 0,
    });
  });

  application = await loadBuiltBrunchApplication();
  const client = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
    fetch: (input, init) =>
      Promise.resolve(
        application!.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
      ).then((response) => response),
    headers: agentOwnershipHeaders(identity),
  });
  history = () => client.history();

  const logicalTurnDurationsMs: number[] = [];
  const dispatch = async (body: string): Promise<void> => {
    const firstCallIndex = modelCalls.length;
    const admission = await client.send({ message: { kind: "user", body } });
    await client.wait(admission);
    logicalTurnDurationsMs.push(
      modelCalls
        .slice(firstCallIndex)
        .reduce((total, call) => total + call.durationMs, 0),
    );
  };

  let interviewTurns = 1;
  let stopReason = "hard-stop";
  await dispatch(openingMessage);

  while (interviewTurns < hardStop) {
    const previousDuration = logicalTurnDurationsMs.at(-1) ?? 0;
    if (previousDuration > latencyStopMs) {
      stopReason = "latency-stop";
      break;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- interview turns are causally sequential.
    const snapshot = await client.history();
    const interviewerText = latestAssistantText(snapshot);
    if (interviewerText.length === 0) {
      stopReason = "empty-interviewer";
      break;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- the expert must answer this settled interviewer turn.
    const expertReply = await askExpert(interviewerText);
    // oxlint-disable-next-line eslint/no-await-in-loop -- the next interviewer turn depends on the expert reply.
    await dispatch(expertReply);
    interviewTurns += 1;
  }

  await dispatch(finalizationMessage);
  const snapshot = await client.history();
  const workpiece = recoverRunbookWorkpiece(snapshot);
  const ir = workpiece?.content;
  const toolNames = interviewerToolNamesFrom(snapshot);
  const resourcePaths = skillResourcePathsFrom(snapshot);
  const resourceFilesRead = [
    ...new Set(resourcePaths.map((path) => basename(path))),
  ];
  const transcript = formatFlueTranscript(snapshot);
  const rawConversationSnapshotSha256 = sha256(JSON.stringify(snapshot));
  const violations = ordinaryElicitationViolationsFrom(snapshot, {
    hasWorkpiece: workpiece !== undefined,
  });
  const status = violations.length === 0 ? "completed" : "invalid";
  const record = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    outputNamespaceId: OUTPUT_NAMESPACE_ID,
    comparisonTarget: COMPARISON_TARGET,
    campaignFingerprint,
    replication,
    runId,
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    ...campaignConfiguration,
    interviewTurns,
    stopReason,
    finalizationMessage,
    logicalTurnDurationsMs,
    modelCalls,
    expertUsage,
    expertCalls,
    expertMessages,
    toolNames,
    resourcePaths,
    ir,
    workpiece,
    violations,
    wroteCaptureStore: false,
    instrument,
    transcript,
    rawConversationSnapshot: snapshot,
    rawConversationSnapshotSha256,
  };
  await writeFile(
    `${artifactBase}.json`,
    `${JSON.stringify(record, null, 2)}\n`,
    { flag: "wx" },
  );
  await writeFile(
    `${artifactBase}.md`,
    [
      `# Prospective candidate runbook elicitation — replication ${replication}`,
      "",
      `- Protocol: \`${PROTOCOL_ID}\``,
      `- Output namespace: \`${OUTPUT_NAMESPACE_ID}\``,
      `- Run: \`${runId}\``,
      `- Source commit: \`${sourceCommit}\``,
      `- Interviewer: \`${interviewerModel}\``,
      `- Simulated expert: \`${expertModel}\``,
      `- Interview turns: ${interviewTurns} (hard stop ${hardStop})`,
      `- Stop reason before final IR request: \`${stopReason}\``,
      `- Recoverable IR: ${ir === undefined ? "no" : "yes"}`,
      `- Member status: \`${status}\``,
      ...(violations.length === 0
        ? []
        : violations.map(
            (violation) =>
              `- Ordinary-path violation: \`${violation.code}\` — ${violation.detail}`,
          )),
      "- Final user message is an evaluation stop instruction, not expert evidence.",
      "",
      transcript,
      "",
    ].join("\n"),
    { flag: "wx" },
  );
  if (ir !== undefined) {
    await writeFile(`${artifactBase}.ir.md`, `${ir}\n`, { flag: "wx" });
  }

  process.stdout.write(
    `PROSPECTIVE_RUNBOOK_V5_RESULT ${JSON.stringify({
      protocolId: PROTOCOL_ID,
      outputNamespaceId: OUTPUT_NAMESPACE_ID,
      replication,
      stopReason,
      hasIr: ir !== undefined,
      interviewTurns,
      toolNames,
      resourceFilesRead,
      wroteCaptureStore: false,
      artifactBase,
    })}\n`,
  );
  if (status === "invalid") process.exitCode = 1;
} catch (error) {
  let transcript: string | undefined;
  let rawConversationSnapshot: FlueConversationSnapshot | undefined;
  if (history !== undefined) {
    try {
      rawConversationSnapshot = await history();
      transcript = formatFlueTranscript(rawConversationSnapshot);
    } catch {
      // Preserve the originating failure even if history recovery also fails.
    }
  }
  const failure = failureFrom(error);
  const workpiece =
    rawConversationSnapshot === undefined
      ? undefined
      : recoverRunbookWorkpiece(rawConversationSnapshot);
  const violations =
    rawConversationSnapshot === undefined
      ? []
      : ordinaryElicitationViolationsFrom(rawConversationSnapshot, {
          hasWorkpiece: workpiece !== undefined,
        });
  const failureRecord = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    outputNamespaceId: OUTPUT_NAMESPACE_ID,
    comparisonTarget: COMPARISON_TARGET,
    campaignFingerprint,
    replication,
    runId,
    status: "invalid",
    invalidReason: "runtime-failure",
    startedAt,
    failedAt: new Date().toISOString(),
    ...campaignConfiguration,
    finalizationMessage,
    modelCalls,
    expertUsage,
    expertCalls,
    expertMessages,
    violations,
    workpiece,
    wroteCaptureStore: false,
    instrument,
    failure,
    transcript,
    rawConversationSnapshot,
    rawConversationSnapshotSha256:
      rawConversationSnapshot === undefined
        ? undefined
        : sha256(JSON.stringify(rawConversationSnapshot)),
  };
  const failureArtifact = `${artifactBase}.failure-${randomUUID().slice(0, 8)}.json`;
  let retentionFailure: unknown;
  try {
    await writeFile(
      failureArtifact,
      `${JSON.stringify(failureRecord, null, 2)}\n`,
      { flag: "wx" },
    );
  } catch (retentionError) {
    retentionFailure = retentionError;
  }
  process.stderr.write(
    `PROSPECTIVE_RUNBOOK_V5_FAILURE ${JSON.stringify({
      runId,
      artifact: retentionFailure === undefined ? failureArtifact : undefined,
      failure,
      retentionFailure:
        retentionFailure instanceof Error
          ? {
              name: retentionFailure.name,
              message: retentionFailure.message,
              stack: retentionFailure.stack,
            }
          : retentionFailure === undefined
            ? undefined
            : {
                name: "UnknownFailure",
                message: unknownFailureMessage(retentionFailure),
              },
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  const cleanupFailures: Array<{
    readonly operation: string;
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  }> = [];
  const retainCleanupFailure = (operation: string, error: unknown): void => {
    cleanupFailures.push(
      error instanceof Error
        ? {
            operation,
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : {
            operation,
            name: "UnknownFailure",
            message: unknownFailureMessage(error),
          },
    );
  };
  try {
    stopObserving?.();
  } catch (error) {
    retainCleanupFailure("stop-observing", error);
  }
  try {
    await application?.stop();
  } catch (error) {
    retainCleanupFailure("stop-application", error);
  }
  try {
    await rm(databasePath, { force: true });
  } catch (error) {
    retainCleanupFailure("remove-temporary-database", error);
  }
  if (cleanupFailures.length > 0) {
    const cleanupArtifact = `${artifactBase}.cleanup-failure-${randomUUID().slice(0, 8)}.json`;
    let retentionFailure: unknown;
    try {
      await writeFile(
        cleanupArtifact,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            protocolId: PROTOCOL_ID,
            outputNamespaceId: OUTPUT_NAMESPACE_ID,
            comparisonTarget: COMPARISON_TARGET,
            campaignFingerprint,
            replication,
            runId,
            status: "invalid",
            invalidReason: "cleanup-failure",
            startedAt,
            failedAt: new Date().toISOString(),
            cleanupFailures,
            instrument,
          },
          null,
          2,
        )}\n`,
        { flag: "wx" },
      );
    } catch (error) {
      retentionFailure = error;
    }
    process.stderr.write(
      `PROSPECTIVE_RUNBOOK_V5_CLEANUP_FAILURE ${JSON.stringify({
        runId,
        artifact: retentionFailure === undefined ? cleanupArtifact : undefined,
        cleanupFailures,
        retentionFailure:
          retentionFailure instanceof Error
            ? {
                name: retentionFailure.name,
                message: retentionFailure.message,
              }
            : retentionFailure === undefined
              ? undefined
              : {
                  name: "UnknownFailure",
                  message: unknownFailureMessage(retentionFailure),
                },
      })}\n`,
    );
    process.exitCode = 1;
  }
}
