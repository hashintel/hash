/**
 * Prospective elicitation-to-IR drive. The production ChatAgent interviews a
 * second model, then emits a Markdown runbook IR without entering construction.
 *
 * Build first, then run:
 *   yarn exec turbo run build --filter @apps/brunch-agent
 *   yarn workspace @apps/brunch-agent runbook:elicit
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { observe, setProvider } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../conversation/identity.ts";
import { formatFlueTranscript } from "../../conversation/transcript.ts";
import { CHAT_AGENT_ROUTE } from "../../http/routes.ts";
import {
  interviewerToolNamesFrom,
  recoverRunbookIr,
  skillResourcePathsFrom,
} from "./artifacts.ts";
import { loadBuiltBrunchApplication } from "./load-built-application.ts";

import type Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "@earendil-works/pi-ai";
import type { FlueConversationSnapshot } from "@flue/sdk";

process.env["BRUNCH_CHAT_MODEL"] ??= "claude-sonnet-4-5";

const execFileAsync = promisify(execFile);
const FROZEN_V1_SOURCE_COMMIT = "b738aa1be1a62a9f9cdde89ced78558f04293a77";
const repositoryRoot = new URL("../../../../../", import.meta.url);
const repositoryRootPath = fileURLToPath(repositoryRoot);
const evaluationRoot = new URL(
  "../../../../../libs/@hashintel/brunch-agent/evaluations/",
  import.meta.url,
);
const caseDirectory = new URL("cases/vestera-scheduling/", evaluationRoot);
const defaultOutputDirectory = new URL(
  "../../../../../libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/",
  import.meta.url,
).pathname;

const expertModel =
  process.env["BRUNCH_RUNBOOK_EXPERT_MODEL"] ?? "claude-sonnet-4-5";
const hardStop = Number(process.env["BRUNCH_RUNBOOK_HARD_STOP"] ?? "8");
const latencyStopMs = Number(
  process.env["BRUNCH_RUNBOOK_LATENCY_STOP_MS"] ?? "180000",
);
const outputDirectory =
  process.env["BRUNCH_RUNBOOK_OUTPUT_DIR"] ?? defaultOutputDirectory;
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
if (!apiKey && !expertClientModule) {
  throw new Error(
    "ANTHROPIC_API_KEY is required unless BRUNCH_RUNBOOK_ANTHROPIC_MODULE is set",
  );
}
const usesFrozenV1Configuration =
  process.env["BRUNCH_CHAT_MODEL"] === "claude-sonnet-4-5" &&
  expertModel === "claude-sonnet-4-5" &&
  hardStop === 8 &&
  latencyStopMs === 180_000 &&
  expertClientModule === undefined &&
  interviewerProviderModule === undefined &&
  !allowDirtyInstrument;
if (outputDirectory === defaultOutputDirectory && !usesFrozenV1Configuration) {
  throw new Error(
    "Only the frozen v1 configuration may write to vestera-prospective-baseline-v1; set BRUNCH_RUNBOOK_OUTPUT_DIR for tests or a different campaign.",
  );
}

const instrumentFiles = [
  "apps/brunch-agent/package.json",
  "apps/brunch-agent/src/agents/chat-agent/agent.ts",
  "apps/brunch-agent/src/agents/chat-agent/host-instructions.ts",
  "apps/brunch-agent/src/agents/chat-agent/tools/ping.ts",
  "apps/brunch-agent/src/agents/chat-agent/tools/read-petrinaut-doc.ts",
  "apps/brunch-agent/src/evaluations/runbook/artifacts.ts",
  "apps/brunch-agent/src/evaluations/runbook/elicitation-run.ts",
  "libs/@hashintel/brunch-agent/packages/core/package.json",
  "libs/@hashintel/brunch-agent/packages/core/src/agent/index.ts",
  "libs/@hashintel/brunch-agent/packages/core/src/agent/system-prompt.ts",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/package.json",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/flue.ts",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/system-instructions.ts",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/tools/petrinaut-construction.ts",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/elicitation.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/ir-template.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/pn-construction.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/checks.md",
  "libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/opening-message.md",
  "libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/situation-pack.md",
  "libs/@hashintel/brunch-agent/evaluations/oracles/vestera-scheduling/truth-ledger-v1-prospective.yaml",
  "libs/@hashintel/brunch-agent/evaluations/oracles/ir-quality-ruler-v1.md",
  "libs/@hashintel/brunch-agent/evaluations/protocols/ir-quality-ruler-v1/omniscient-grader.md",
  "libs/@hashintel/brunch-agent/evaluations/protocols/ir-quality-ruler-v1/cold-ir-reviewer.md",
  "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v1/protocol.md",
] as const;

const sha256 = (content: string | Buffer): string =>
  createHash("sha256").update(content).digest("hex");

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
if (
  outputDirectory === defaultOutputDirectory &&
  sourceCommit !== FROZEN_V1_SOURCE_COMMIT
) {
  throw new Error(
    `vestera-prospective-baseline-v1 belongs to source commit ${FROZEN_V1_SOURCE_COMMIT}; set BRUNCH_RUNBOOK_OUTPUT_DIR for relocated or redesigned source.`,
  );
}
const { stdout: statusOutput } = await execFileAsync(
  "git",
  ["status", "--short", "--", ...instrumentFiles],
  { cwd: repositoryRootPath },
);
const instrumentStatus = statusOutput.trim();
if (instrumentStatus.length > 0 && !allowDirtyInstrument) {
  throw new Error(
    `Prospective instrument files are not clean:\n${instrumentStatus}\n` +
      "Commit them before a paid run, or set BRUNCH_RUNBOOK_ALLOW_DIRTY_INSTRUMENT=1 only for a hermetic test.",
  );
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
  "Preserve every unresolved unknown, assumption, conflict, omission, and loss.",
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

const expertMessages: ExpertMessage[] = [];
const expertUsage = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

const errorMessageFrom = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
  const text = response.content
    .filter(
      (block): block is { readonly type: "text"; readonly text: string } =>
        block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (text.length === 0)
    throw new Error("The simulated expert returned no text");
  expertMessages.push({ role: "assistant", content: text });
  return text;
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

type ModelCall = {
  readonly durationMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cost: number;
};
const modelCalls: ModelCall[] = [];
const stopObserving = observe((event) => {
  if (event.type !== "turn") return;
  const usage = event.response.usage;
  modelCalls.push({
    durationMs: event.durationMs,
    inputTokens: usage?.input ?? 0,
    outputTokens: usage?.output ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    cost: usage?.cost.total ?? 0,
  });
});

const startedAt = new Date().toISOString();
const runId = `runbook-elicitation-${startedAt.replaceAll(
  /[:.]/gu,
  "-",
)}-${randomUUID().slice(0, 8)}`;
const identity = {
  principalKey: "principal-runbook-elicitation",
  conversationId: runId,
};
const instanceId = flueConversationIdFrom(identity);
const databasePath = join(tmpdir(), `${runId}.db`);
process.env["BRUNCH_DEV_DB_PATH"] = databasePath;

await mkdir(outputDirectory, { recursive: true });
const application = await loadBuiltBrunchApplication();

try {
  const client = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
    fetch: (input, init) =>
      Promise.resolve(
        application.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
      ).then((response) => response),
    headers: agentOwnershipHeaders(identity),
  });

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
  let failure: string | undefined;
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
    let expertReply: string;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the expert must answer this settled interviewer turn.
      expertReply = await askExpert(interviewerText);
    } catch (error) {
      stopReason = "expert-error";
      failure = errorMessageFrom(error);
      break;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- the next interviewer turn depends on the expert reply.
    await dispatch(expertReply);
    interviewTurns += 1;
  }

  await dispatch(finalizationMessage);
  const snapshot = await client.history();
  const ir = recoverRunbookIr(snapshot);
  const toolNames = interviewerToolNamesFrom(snapshot);
  const resourcePaths = skillResourcePathsFrom(snapshot);
  const resourceFilesRead = [
    ...new Set(resourcePaths.map((path) => basename(path))),
  ];
  const transcript = formatFlueTranscript(snapshot);
  const builtArtifact = await readFile(
    new URL("../../../dist/app.mjs", import.meta.url),
  );
  const record = {
    runId,
    startedAt,
    interviewerModel: process.env["BRUNCH_CHAT_MODEL"],
    expertModel,
    hardStop,
    latencyStopMs,
    interviewTurns,
    stopReason,
    finalizationMessage,
    logicalTurnDurationsMs,
    modelCalls,
    expertUsage,
    toolNames,
    resourcePaths,
    ir,
    failure,
    wroteCaptureStore: false,
    instrument: {
      sourceCommit,
      instrumentStatus,
      fileSha256,
      builtArtifactSha256: sha256(builtArtifact),
    },
    transcript,
  };
  const artifactBase = join(outputDirectory, runId);
  await writeFile(
    `${artifactBase}.json`,
    `${JSON.stringify(record, null, 2)}\n`,
  );
  await writeFile(
    `${artifactBase}.md`,
    [
      `# Prospective runbook elicitation — ${runId}`,
      "",
      `- Source commit: \`${sourceCommit}\``,
      `- Interviewer: \`${record.interviewerModel}\``,
      `- Simulated expert: \`${expertModel}\``,
      `- Interview turns: ${interviewTurns} (hard stop ${hardStop})`,
      `- Stop reason before final IR request: \`${stopReason}\``,
      `- Recoverable IR: ${ir === undefined ? "no" : "yes"}`,
      "- Final user message is an evaluation stop instruction, not expert evidence.",
      "",
      transcript,
      "",
    ].join("\n"),
  );
  if (ir !== undefined) {
    await writeFile(`${artifactBase}.ir.md`, `${ir}\n`);
  }

  process.stdout.write(
    `RUNBOOK_ELICITATION_RESULT ${JSON.stringify({
      stopReason,
      hasIr: ir !== undefined,
      interviewTurns,
      toolNames,
      resourceFilesRead,
      failure,
      wroteCaptureStore: false,
      artifactBase,
    })}\n`,
  );
  if (failure !== undefined || ir === undefined) process.exitCode = 1;
} finally {
  stopObserving();
  await application.stop();
  await rm(databasePath, { force: true });
}
