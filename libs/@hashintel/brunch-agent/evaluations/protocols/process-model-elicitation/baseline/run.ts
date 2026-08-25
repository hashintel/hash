// Baseline interview runner (FE-1361 and FE-1404).
//
// Conditions 1 and 2 preserve the reviewed FE-1361 controls: bare Claude and
// the v0 elicitation prompt. Condition 3 adds the frozen FE-1404 completion and
// guidance instrument plus a test-only, transcript-bounded operator projection.
//
// Usage: ANTHROPIC_API_KEY=... node --experimental-strip-types run.ts <1|2|3|4> [--resume|--continue-final|--verify-seal]
//   Condition 4 is the ADR-0007 teaching layer as prompt only: the interviewer's system prompt is
//   condition-4-prompt.md plus the harness's rendering of the repertoire and the SDCPN plugin
//   definition (contract, guidance, construct runbook), with no harness machinery behind it. It
//   reads the rendering from `@hashintel/brunch-agent`'s built output, so run `turbo build` first.
//   --resume          continue an interrupted run from its checkpoint
//   --continue-final  ask the interviewer to finish a final delivery that was cut off at
//                     max_tokens; C1/C2 merge legacy output, while C3 appends a sealed segment
//   --verify-seal     validate condition 3's exact manifest and chronology without a model call
//
// Production outputs, under docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/:
//   condition-<n>.md        readable transcript with run metadata
//   condition-<n>.raw.json  full message arrays + per-call token usage (also the checkpoint)
//   condition-<n>-model.txt the final delivery message, verbatim (delivered runs only)
// Condition-3 recovery uses numbered `.segment-NNN-{resume,continuation}` stems and never
// overwrites its source raw trace.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  assertCompleteCondition3Projection,
  assertCondition3ProjectionSemantics,
  assertCondition3UnsupportedAnchorContinuity,
  CONDITION_3_ACTIVATION_MATRIX,
  CONDITION_3_DEMAND_CLAUSES,
  CONDITION_3_DEMAND_TABLE_VERSION,
  CONDITION_3_DIAGNOSTIC_PRIORITY,
  CONDITION_3_GEN_Q02_LAYER_2,
  CONDITION_3_INSTRUMENT_VERSION,
  CONDITION_3_LOCKED_PATHS,
  CONDITION_3_OPERATOR_ENVELOPE,
  CONDITION_3_STOPPING_RULES,
  nextCondition3NoProgressStreak,
  parseCondition3Projection,
  type Condition3CardId,
  type Condition3ClauseId,
  type Condition3FiresWhen,
  type Condition3Projection,
} from "./condition-3-instrument.ts";

import type Anthropic from "@anthropic-ai/sdk";

const INTERVIEWER_MODEL = "claude-opus-5";
const EXPERT_MODEL = "claude-sonnet-5";
const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";
const OPERATOR_MODEL = "claude-opus-5";

// Interviewer turns, not exchanges. ReqElicitGym budgets 20; we force a wrap-up at 20 and
// hard-stop at 24 in case the model keeps talking instead of delivering.
const LEGACY_FORCE_WRAP_AT = 20;
const LEGACY_HARD_STOP_AT = 24;
// The scripted impatience probe (LLMREI: interviewers end too readily on impatience cues).
// Appended to the expert's reply on this exchange, identically in both conditions.
const LEGACY_IMPATIENCE_AT = 8;
const IMPATIENCE_LINE =
  "(Sorry — I've just seen the time, I have the floor huddle in ten minutes. How much more do you need?)";
const FORCED_WRAP_MESSAGE =
  "I really do have to stop here. Please produce the model now with everything you have.";
const CONTINUE_MESSAGE =
  "You were cut off mid-document. Continue exactly from where you stopped — no preamble, no repetition.";

type ChatMessage = Omit<Anthropic.MessageParam, "content"> & {
  content: Extract<Anthropic.MessageParam["content"], string>;
  // Present only when the API ended this model-generated message at its token limit.
  // Older checkpoints and human-authored messages legitimately omit it.
  truncated?: true;
  // Condition 3 appends an operator diagnostic to the interviewer-facing user
  // message. The expert's next call must see only its own original answer.
  expertContent?: string;
  operatorDiagnostic?: string;
  experimentStimulus?: string;
  // Condition 3 recovery is append-only. The source message and its truncation
  // marker remain intact; later pieces are separate durable seam records.
  continuations?: Array<{
    content: string;
    truncated: boolean;
    recordedAt: string;
  }>;
};

type Usage = Pick<Anthropic.Usage, "input_tokens" | "output_tokens"> &
  Partial<
    Pick<
      Anthropic.Usage,
      "cache_creation_input_tokens" | "cache_read_input_tokens"
    >
  >;

interface CallRecord {
  agent: "interviewer" | "expert" | "classifier" | "operator";
  model: Anthropic.Model;
  usage: Usage;
}

interface CallResult {
  text: string;
  truncated: boolean;
  sourceText?: string;
  continuations?: ChatMessage["continuations"];
}

interface Condition3ActivationMatch {
  cardId: Exclude<Condition3CardId, "GEN-Q02">;
  clauseId: Condition3ClauseId;
  predicate: Condition3FiresWhen;
}

interface Condition3ProjectionRecord extends Condition3Projection {
  turn: number;
  recordedAt: string;
  selectedClauseId: Condition3ClauseId | null;
  selectedUnsupportedAnchorLabel: string | null;
  selectedCardId: Condition3CardId | null;
  selectedPredicate: Condition3FiresWhen | null;
  activationMatches: Condition3ActivationMatch[];
  noProgressStreak: number;
  noProgressAdvisory: boolean;
}

interface Condition3Preregistration {
  path: string;
  sha256: string;
  sealedAt: string;
  modifiedAt: string;
  verifiedBeforeRun: boolean;
}

interface Condition3OperatorAttempt {
  turn: number;
  attempt: number;
  recordedAt: string;
  rawText: string;
  parseError: string | null;
}

interface RawCheckpoint {
  startedAt: string;
  condition: "1" | "2" | "3" | "4";
  stopReason: string;
  calls: CallRecord[];
  interviewerMessages: ChatMessage[];
  instrumentVersion?: string;
  demandTableVersion?: string;
  modelConfiguration?: {
    interviewer: string;
    expert: string;
    classifier: string;
    operator: string;
    sampling: string;
    seed: null;
    seedSupport: false;
  };
  preregistration?: Condition3Preregistration;
  operatorProjections?: Condition3ProjectionRecord[];
  operatorAttempts?: Condition3OperatorAttempt[];
  impatienceProbeTurn?: number;
  genQ02Layer2?: typeof CONDITION_3_GEN_Q02_LAYER_2;
  recovery?: {
    mode: "resume" | "continue-final";
    sourceRawPath: string;
    sourceSha256: string;
    seams: Array<{
      kind:
        | "truncated-expert-regeneration"
        | "truncated-interviewer-regeneration"
        | "final-continuation";
      sourceHadTruncationMarker: true;
      sourceContent: string;
      recordedAt: string;
    }>;
  };
}

const CONDITION_3_MODEL_CONFIGURATION = {
  interviewer: INTERVIEWER_MODEL,
  expert: EXPERT_MODEL,
  classifier: CLASSIFIER_MODEL,
  operator: OPERATOR_MODEL,
  sampling: CONDITION_3_STOPPING_RULES.providerSampling,
  seed: null,
  seedSupport: false,
} as const;

function usage(): never {
  console.error(
    "usage: node run.ts <1|2|3|4> [--resume|--continue-final|--verify-seal]",
  );
  process.exit(1);
}

const conditionArg = process.argv[2];
const mode = process.argv[3] ?? "fresh";
if (
  conditionArg !== "1" &&
  conditionArg !== "2" &&
  conditionArg !== "3" &&
  conditionArg !== "4"
)
  usage();
if (
  mode !== "fresh" &&
  mode !== "--resume" &&
  mode !== "--continue-final" &&
  mode !== "--verify-seal"
)
  usage();
if (mode === "--verify-seal" && conditionArg !== "3") usage();
const condition = conditionArg;
const clientModule = process.env["BRUNCH_BASELINE_ANTHROPIC_MODULE"];
const testOutputDirectory = process.env["BRUNCH_BASELINE_TEST_OUTPUT_DIR"];
const apiKey = process.env["ANTHROPIC_API_KEY"];
if (mode !== "--verify-seal" && testOutputDirectory && !clientModule) {
  console.error(
    "BRUNCH_BASELINE_TEST_OUTPUT_DIR requires BRUNCH_BASELINE_ANTHROPIC_MODULE",
  );
  process.exit(1);
}
if (mode !== "--verify-seal" && !apiKey && !clientModule) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}
interface BaselineAnthropicClient {
  messages: {
    create(
      request: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Message>;
  };
}

let anthropic: BaselineAnthropicClient | undefined;

async function getAnthropic(): Promise<BaselineAnthropicClient> {
  if (anthropic) return anthropic;
  const resolvedClient = clientModule
    ? ((await import(clientModule)).default as BaselineAnthropicClient)
    : (new (await import("@anthropic-ai/sdk")).default({
        apiKey,
        maxRetries: 5,
        timeout: 30 * 60 * 1000,
      }) as BaselineAnthropicClient);
  anthropic = resolvedClient;
  return resolvedClient;
}

const baseDir = fileURLToPath(new URL(".", import.meta.url));
const caseDir = fileURLToPath(
  new URL(
    "../../../cases/process-model-elicitation/baseline/",
    import.meta.url,
  ),
);
const transcriptDir =
  testOutputDirectory ??
  fileURLToPath(
    new URL(
      "../../../../docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/",
      import.meta.url,
    ),
  );
const calls: CallRecord[] = [];
const operatorProjections: Condition3ProjectionRecord[] = [];
const operatorAttempts: Condition3OperatorAttempt[] = [];

function completeMessageContent(message: ChatMessage): string {
  return (
    message.content +
    (message.continuations ?? [])
      .map((continuation) => continuation.content)
      .join("")
  );
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function callClaude(
  agent: CallRecord["agent"],
  model: CallRecord["model"],
  system: string | undefined,
  messages: ChatMessage[],
  maxTokens: number,
  options: { allowThinking?: boolean } = {},
): Promise<CallResult> {
  // The interviewer keeps the model's default (adaptive) thinking — that is part of "vanilla
  // Claude". The expert and classifier have it disabled: a thinking block that consumes the
  // whole token budget yields an empty text message, which the API then rejects on re-send.
  // Transport-level retries (429/5xx/network, retry-after) live in the SDK; this loop only
  // handles the empty-text case, which is a budget problem rather than a transport one.
  let tokenBudget = maxTokens;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await (
      await getAnthropic()
    ).messages.create({
      model,
      max_tokens: tokenBudget,
      ...(options.allowThinking
        ? {}
        : { thinking: { type: "disabled" as const } }),
      ...(system ? { system } : {}),
      // Project persistence metadata out of the provider request while retaining
      // every append-only continuation piece in the message's semantic content.
      messages: messages.map((message) => ({
        role: message.role,
        content: completeMessageContent(message),
      })),
    });
    calls.push({
      agent,
      model: response.model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens:
          response.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      },
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (text.trim() === "") {
      // Adaptive thinking can consume the entire budget before any text is emitted.
      tokenBudget *= 2;
      console.error(
        `  ${agent}: empty text (blocks: ${response.content.map((block) => block.type).join(",")}), ` +
          `retrying with max_tokens=${tokenBudget}`,
      );
      continue;
    }
    return { text, truncated: response.stop_reason === "max_tokens" };
  }
  throw new Error(`${agent}: exhausted retries`);
}

// The interviewer's final delivery can exceed one response budget; stitch continuations into
// a single message so the transcript holds the complete deliverable. The truncation flag of
// the *last* piece survives the stitching: a message still cut off after the piece cap must
// be reported as incomplete, not silently written as if it were whole.
async function callInterviewer(
  system: string | undefined,
  messages: ChatMessage[],
): Promise<CallResult> {
  let result = await callClaude(
    "interviewer",
    INTERVIEWER_MODEL,
    system,
    messages,
    16_000,
    {
      allowThinking: true,
    },
  );
  const sourceText = result.text;
  const continuations: NonNullable<ChatMessage["continuations"]> = [];
  let text = result.text;
  for (let piece = 1; result.truncated && piece <= 4; piece++) {
    console.error(`  interviewer: truncated, requesting continuation ${piece}`);
    result = await callClaude(
      "interviewer",
      INTERVIEWER_MODEL,
      system,
      [
        ...messages,
        { role: "assistant", content: text },
        { role: "user", content: CONTINUE_MESSAGE },
      ],
      16_000,
      { allowThinking: true },
    );
    continuations.push({
      content: result.text,
      truncated: result.truncated,
      recordedAt: new Date().toISOString(),
    });
    // No separator at the seam: the cut usually lands mid-line or mid-token
    // and the model is instructed to continue exactly from where it stopped,
    // so an injected newline would corrupt the merged document.
    text += result.text;
  }
  return condition === "3" && continuations.length > 0
    ? {
        text,
        truncated: result.truncated,
        sourceText,
        continuations,
      }
    : { text, truncated: result.truncated };
}

async function loadSection(file: string): Promise<string> {
  const raw = await readFile(
    file.startsWith("/") ? file : baseDir + file,
    "utf8",
  );
  const separatorIndex = raw.indexOf("\n---\n");
  return separatorIndex === -1
    ? raw.trim()
    : raw.slice(separatorIndex + 5).trim();
}

async function loadCondition3Preregistration(
  runStartedAt: string,
): Promise<Condition3Preregistration> {
  const path = `${baseDir}condition-3-preregistration.lock.json`;
  const contextRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const [content, metadata] = await Promise.all([
    readFile(path, "utf8"),
    stat(path),
  ]);
  const lock = JSON.parse(content) as {
    version?: unknown;
    sealedAt?: unknown;
    files?: unknown;
  };
  if (
    lock.version !== CONDITION_3_INSTRUMENT_VERSION ||
    typeof lock.sealedAt !== "string" ||
    !Number.isFinite(Date.parse(lock.sealedAt)) ||
    !Array.isArray(lock.files) ||
    lock.files.length === 0
  ) {
    throw new Error("condition-3 preregistration lock has an invalid envelope");
  }
  const rows: Array<{ path: string; sha256: string }> = [];
  for (const item of lock.files) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("path" in item) ||
      typeof item.path !== "string" ||
      !("sha256" in item) ||
      typeof item.sha256 !== "string"
    ) {
      throw new Error(
        "condition-3 preregistration lock has an invalid file row",
      );
    }
    rows.push({ path: item.path, sha256: item.sha256 });
  }
  const actualPaths = rows.map(({ path: lockedPath }) => lockedPath);
  const duplicatePaths = actualPaths.filter(
    (lockedPath, index) => actualPaths.indexOf(lockedPath) !== index,
  );
  const missingPaths = CONDITION_3_LOCKED_PATHS.filter(
    (lockedPath) => !actualPaths.includes(lockedPath),
  );
  const extraPaths = actualPaths.filter(
    (lockedPath) =>
      !CONDITION_3_LOCKED_PATHS.includes(
        lockedPath as (typeof CONDITION_3_LOCKED_PATHS)[number],
      ),
  );
  const pathsAreInCanonicalOrder = actualPaths.every(
    (lockedPath, index) => lockedPath === CONDITION_3_LOCKED_PATHS[index],
  );
  if (
    actualPaths.length !== CONDITION_3_LOCKED_PATHS.length ||
    duplicatePaths.length > 0 ||
    missingPaths.length > 0 ||
    extraPaths.length > 0 ||
    !pathsAreInCanonicalOrder
  ) {
    throw new Error(
      `condition-3 preregistration manifest is not canonical: missing=${missingPaths.join(",") || "none"}; extra=${extraPaths.join(",") || "none"}; duplicate=${duplicatePaths.join(",") || "none"}; order=${pathsAreInCanonicalOrder ? "canonical" : "noncanonical"}`,
    );
  }
  let newestLockedMtimeMs = Number.NEGATIVE_INFINITY;
  for (const item of rows) {
    const lockedFilePath = contextRoot + item.path;
    const [lockedContent, lockedMetadata] = await Promise.all([
      readFile(lockedFilePath, "utf8"),
      stat(lockedFilePath),
    ]);
    const actualHash = sha256(lockedContent);
    if (actualHash !== item.sha256) {
      throw new Error(
        `condition-3 preregistration mismatch for ${item.path}: expected ${item.sha256}, got ${actualHash}`,
      );
    }
    newestLockedMtimeMs = Math.max(newestLockedMtimeMs, lockedMetadata.mtimeMs);
  }
  const sealedAtMs = Date.parse(lock.sealedAt);
  if (
    sealedAtMs <= newestLockedMtimeMs ||
    metadata.mtimeMs <= newestLockedMtimeMs ||
    metadata.mtimeMs < sealedAtMs
  ) {
    throw new Error(
      "condition-3 preregistration chronology is invalid: sealedAt and finalized lock mtime must postdate every locked file, and lock mtime must not predate sealedAt",
    );
  }
  const modifiedAt = metadata.mtime.toISOString();
  const verifiedBeforeRun =
    metadata.mtimeMs <= Date.parse(runStartedAt) &&
    sealedAtMs <= Date.parse(runStartedAt);
  if (!verifiedBeforeRun) {
    throw new Error(
      "condition-3 preregistration lock does not predate the run",
    );
  }
  return {
    path,
    sha256: sha256(content),
    sealedAt: lock.sealedAt,
    modifiedAt,
    verifiedBeforeRun,
  };
}

function assertCondition3CheckpointBinding(
  checkpoint: RawCheckpoint,
  currentPreregistration: Condition3Preregistration,
): void {
  const expectedConfigurationEntries = Object.entries(
    CONDITION_3_MODEL_CONFIGURATION,
  );
  const modelConfigurationMatches =
    checkpoint.modelConfiguration !== undefined &&
    Object.keys(checkpoint.modelConfiguration).length ===
      expectedConfigurationEntries.length &&
    expectedConfigurationEntries.every(
      ([key, value]) =>
        checkpoint.modelConfiguration?.[
          key as keyof typeof checkpoint.modelConfiguration
        ] === value,
    );
  if (
    checkpoint.condition !== "3" ||
    checkpoint.instrumentVersion !== CONDITION_3_INSTRUMENT_VERSION ||
    checkpoint.demandTableVersion !== CONDITION_3_DEMAND_TABLE_VERSION ||
    checkpoint.preregistration?.sha256 !== currentPreregistration.sha256 ||
    !modelConfigurationMatches
  ) {
    throw new Error(
      "condition-3 checkpoint binding mismatch: seal, instrument, DemandTable, and model configuration must match exactly before recovery",
    );
  }
}

async function resolveArtifactPaths(): Promise<{
  artifactStem: string;
  rawPath: string;
  sourceRawPath?: string;
}> {
  const baseStem = `condition-${condition}`;
  const baseRawPath = `${transcriptDir}/${baseStem}.raw.json`;
  if (condition !== "3" || mode === "fresh") {
    return { artifactStem: baseStem, rawPath: baseRawPath };
  }
  const entries = await readdir(transcriptDir);
  const candidates = entries.flatMap((name) => {
    if (name === "condition-3.raw.json") {
      return [{ sequence: 0, path: `${transcriptDir}/${name}` }];
    }
    const match =
      /^condition-3\.segment-(\d{3})-(?:resume|continuation)\.raw\.json$/u.exec(
        name,
      );
    return match
      ? [
          {
            sequence: Number.parseInt(match[1] ?? "0", 10),
            path: `${transcriptDir}/${name}`,
          },
        ]
      : [];
  });
  const latest = candidates.sort(
    (left, right) => right.sequence - left.sequence,
  )[0];
  if (!latest) {
    throw new Error("condition-3 recovery has no source raw checkpoint");
  }
  const nextSequence = String(latest.sequence + 1).padStart(3, "0");
  const recoveryLabel = mode === "--continue-final" ? "continuation" : "resume";
  const artifactStem = `condition-3.segment-${nextSequence}-${recoveryLabel}`;
  return {
    artifactStem,
    rawPath: `${transcriptDir}/${artifactStem}.raw.json`,
    sourceRawPath: latest.path,
  };
}

function parseOperatorJson(text: string): Condition3Projection {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/u, "")
    .replace(/\s*```$/u, "");
  const projection = parseCondition3Projection(
    JSON.parse(withoutFence) as unknown,
  );
  assertCompleteCondition3Projection(projection);
  assertCondition3ProjectionSemantics(projection);

  const clausesById = new Map(
    CONDITION_3_DEMAND_CLAUSES.map((clause) => [clause.id, clause]),
  );
  for (const assessment of projection.assessments) {
    const clause = clausesById.get(assessment.clauseId as Condition3ClauseId);
    if (!clause) {
      throw new Error(
        `condition-3 operator returned unknown clause ${assessment.clauseId}`,
      );
    }
    if (
      assessment.coordinate !== clause.coordinate ||
      assessment.demand !== clause.demand
    ) {
      throw new Error(
        `condition-3 operator changed frozen metadata for ${assessment.clauseId}`,
      );
    }
    const demanded =
      clause.row === null ||
      projection.activeObjectiveRows.includes(clause.row);
    if (assessment.demanded !== demanded) {
      throw new Error(
        `condition-3 operator demand applicability disagrees with the active rows for ${assessment.clauseId}`,
      );
    }
    if (
      !demanded &&
      (!assessment.pass ||
        assessment.currentStatus !== "not-applicable" ||
        assessment.currentGrade !== "not-applicable" ||
        assessment.failureDiagnostic !== null ||
        assessment.activationPredicates.length !== 0)
    ) {
      throw new Error(
        `condition-3 operator did not mark inactive clause ${assessment.clauseId} inapplicable`,
      );
    }
  }
  return projection;
}

function validateProjectionEvidence(
  projection: Condition3Projection,
  messages: ChatMessage[],
): void {
  const visibleTextByTurn = new Map<number, string[]>();
  messages.forEach((message, index) => {
    if (message.role !== "user") return;
    const turn = Math.ceil(index / 2);
    const visibleText = message.expertContent ?? message.content;
    const texts = visibleTextByTurn.get(turn) ?? [];
    texts.push(visibleText);
    visibleTextByTurn.set(turn, texts);
  });
  for (const rowEvidence of projection.activeObjectiveRowEvidence) {
    for (const evidence of rowEvidence.evidence) {
      const suppliedAtTurn = visibleTextByTurn.get(evidence.turn) ?? [];
      if (!suppliedAtTurn.some((text) => text.includes(evidence.quote))) {
        throw new Error(
          `condition-3 activation evidence quote for ${rowEvidence.row} does not occur in supplied transcript turn ${evidence.turn}`,
        );
      }
    }
  }
  for (const anchor of projection.retractedObjectiveAnchors) {
    for (const evidence of [...anchor.evidence, ...anchor.resolutionEvidence]) {
      const suppliedAtTurn = visibleTextByTurn.get(evidence.turn) ?? [];
      if (!suppliedAtTurn.some((text) => text.includes(evidence.quote))) {
        throw new Error(
          `condition-3 evidence quote for retracted objective anchor '${anchor.anchorLabel}' does not occur in supplied transcript turn ${evidence.turn}`,
        );
      }
    }
  }
  for (const assessment of projection.assessments) {
    for (const evidence of assessment.evidence) {
      const suppliedAtTurn = visibleTextByTurn.get(evidence.turn) ?? [];
      if (!suppliedAtTurn.some((text) => text.includes(evidence.quote))) {
        throw new Error(
          `condition-3 evidence quote for ${assessment.clauseId} does not occur in supplied transcript turn ${evidence.turn}`,
        );
      }
    }
  }
  for (const anchor of projection.unsupportedActiveObjectiveAnchors) {
    const allAnchorEvidence = [
      ...anchor.evidence,
      ...(anchor.state === "retracted" ? anchor.resolutionEvidence : []),
    ];
    for (const evidence of allAnchorEvidence) {
      const suppliedAtTurn = visibleTextByTurn.get(evidence.turn) ?? [];
      if (!suppliedAtTurn.some((text) => text.includes(evidence.quote))) {
        throw new Error(
          `condition-3 evidence quote for unsupported active objective anchor '${anchor.label}' does not occur in supplied transcript turn ${evidence.turn}`,
        );
      }
    }
  }
}

function operatorTranscript(messages: ChatMessage[]): string {
  return messages
    .map((message, index) => {
      const speaker =
        message.role === "assistant"
          ? "INTERVIEWER"
          : message.experimentStimulus && !message.expertContent
            ? "EXPERIMENT_STIMULUS"
            : index === 0
              ? "OPENING"
              : "EXPERT";
      const visibleContent = message.expertContent
        ? `${message.expertContent}${message.experimentStimulus ? `\n\n<EXPERIMENT_STIMULUS>${message.experimentStimulus}</EXPERIMENT_STIMULUS>` : ""}`
        : completeMessageContent(message);
      return `[${speaker} turn=${Math.ceil(index / 2)}]\n${visibleContent}`;
    })
    .join("\n\n");
}

async function callCondition3Operator(
  operatorSystem: string,
  messages: ChatMessage[],
  turn: number,
): Promise<Condition3Projection> {
  let priorError = "";
  let lastValidationError = "not recorded";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await callClaude(
      "operator",
      OPERATOR_MODEL,
      operatorSystem,
      [
        {
          role: "user",
          content:
            "Return the complete projection JSON for this transcript.\n\n" +
            operatorTranscript(messages) +
            priorError,
        },
      ],
      12_000,
    );
    try {
      const projection = parseOperatorJson(result.text);
      validateProjectionEvidence(projection, messages);
      assertCondition3UnsupportedAnchorContinuity(
        operatorProjections.at(-1),
        projection,
        turn,
      );
      operatorAttempts.push({
        turn,
        attempt,
        recordedAt: new Date().toISOString(),
        rawText: result.text,
        parseError: null,
      });
      return projection;
    } catch (error) {
      const parseError = error instanceof Error ? error.message : String(error);
      lastValidationError = parseError;
      operatorAttempts.push({
        turn,
        attempt,
        recordedAt: new Date().toISOString(),
        rawText: result.text,
        parseError,
      });
      console.error(
        `condition-3 operator projection rejected at turn ${turn}, attempt ${attempt}: ${parseError}`,
      );
      priorError = `\n\nYour previous response failed validation: ${parseError}. Return a corrected complete JSON projection.`;
    }
  }
  throw new Error(
    `condition-3 operator exhausted projection-validation attempts; last error: ${lastValidationError}`,
  );
}

function activationMatches(
  projection: Condition3Projection,
): Condition3ActivationMatch[] {
  const matches: Condition3ActivationMatch[] = [];
  for (const assessment of projection.assessments) {
    for (const binding of CONDITION_3_ACTIVATION_MATRIX) {
      if (!binding.clauses.includes(assessment.clauseId as never)) continue;
      for (const predicate of assessment.activationPredicates) {
        if (binding.predicates.includes(predicate as never)) {
          matches.push({
            cardId: binding.cardId,
            clauseId: assessment.clauseId as Condition3ClauseId,
            predicate,
          });
        }
      }
    }
  }

  return matches;
}

function selectedAssessment(projection: Condition3Projection) {
  for (const clauseId of CONDITION_3_DIAGNOSTIC_PRIORITY) {
    const assessment = projection.assessments.find(
      (candidate) => candidate.clauseId === clauseId && !candidate.pass,
    );
    if (assessment) return assessment;
  }
  return null;
}

function assertCondition3CheckpointSemantics(checkpoint: RawCheckpoint): void {
  if (
    !Array.isArray(checkpoint.interviewerMessages) ||
    checkpoint.interviewerMessages.some(
      (message) =>
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string",
    )
  ) {
    throw new Error("condition-3 checkpoint has malformed interview messages");
  }
  if (
    !Array.isArray(checkpoint.operatorProjections) ||
    !Array.isArray(checkpoint.operatorAttempts)
  ) {
    throw new Error("condition-3 checkpoint lacks an operator trace");
  }
  const validatedHistory: Condition3Projection[] = [];
  const selectedUnsupportedLabels = new Set<string>();
  for (const [index, record] of checkpoint.operatorProjections.entries()) {
    if (
      record.turn !== index + 1 ||
      typeof record.recordedAt !== "string" ||
      !Number.isInteger(record.noProgressStreak) ||
      typeof record.noProgressAdvisory !== "boolean"
    ) {
      throw new Error(
        "condition-3 checkpoint projection metadata is malformed or non-sequential",
      );
    }
    const projection = parseCondition3Projection({
      activeObjectiveRows: record.activeObjectiveRows,
      activeObjectiveRowEvidence: record.activeObjectiveRowEvidence,
      retractedObjectiveAnchors: record.retractedObjectiveAnchors,
      unsupportedActiveObjectiveAnchors:
        record.unsupportedActiveObjectiveAnchors,
      assessments: record.assessments,
      notes: record.notes,
    });
    assertCompleteCondition3Projection(projection);
    assertCondition3ProjectionSemantics(projection);
    assertCondition3UnsupportedAnchorContinuity(
      validatedHistory.at(-1),
      projection,
      record.turn,
    );
    validateProjectionEvidence(
      projection,
      checkpoint.interviewerMessages.slice(0, record.turn * 2 + 1),
    );
    const expectedStreak = nextCondition3NoProgressStreak(
      validatedHistory,
      projection,
      record.turn,
      validatedHistory.length === 0
        ? 0
        : (checkpoint.operatorProjections[index - 1]?.noProgressStreak ?? 0),
    );
    const expectedMatches = activationMatches(projection);
    const selectedUnsupportedAnchor =
      projection.unsupportedActiveObjectiveAnchors.find(
        ({ label, state }) =>
          state === "active" && !selectedUnsupportedLabels.has(label),
      );
    const selected = selectedUnsupportedAnchor
      ? null
      : selectedAssessment(projection);
    const selectedMatch = selected
      ? expectedMatches.find((match) => match.clauseId === selected.clauseId)
      : undefined;
    if (
      record.noProgressStreak !== expectedStreak ||
      record.noProgressAdvisory !==
        expectedStreak >= CONDITION_3_STOPPING_RULES.noProgressAdvisoryAfter ||
      JSON.stringify(record.activationMatches) !==
        JSON.stringify(expectedMatches) ||
      record.selectedUnsupportedAnchorLabel !==
        (selectedUnsupportedAnchor?.label ?? null) ||
      record.selectedClauseId !== (selected?.clauseId ?? null) ||
      record.selectedCardId !== (selectedMatch?.cardId ?? null) ||
      record.selectedPredicate !== (selectedMatch?.predicate ?? null)
    ) {
      throw new Error(
        `condition-3 checkpoint projection semantics disagree at turn ${record.turn}`,
      );
    }
    if (selectedUnsupportedAnchor) {
      selectedUnsupportedLabels.add(selectedUnsupportedAnchor.label);
    }
    validatedHistory.push(projection);
  }
  if (
    checkpoint.operatorAttempts.some(
      (attempt) =>
        !Number.isInteger(attempt.turn) ||
        !Number.isInteger(attempt.attempt) ||
        typeof attempt.recordedAt !== "string" ||
        typeof attempt.rawText !== "string" ||
        (attempt.parseError !== null && typeof attempt.parseError !== "string"),
    )
  ) {
    throw new Error("condition-3 checkpoint operator attempts are malformed");
  }
}

function renderOperatorDiagnostic(
  projection: Condition3ProjectionRecord,
): string {
  if (projection.selectedUnsupportedAnchorLabel !== null) {
    return [
      "clause=unsupported-active-anchor",
      `coordinate=${projection.selectedUnsupportedAnchorLabel}`,
      "status=explicit",
      "grade=verbal",
      "demand=record the active objective as unsupported by the frozen row set; do not invent a binding",
      "failure=unsupported-active-anchor",
    ].join("; ");
  }
  const selected = projection.assessments.find(
    (assessment) => assessment.clauseId === projection.selectedClauseId,
  );
  if (!selected) {
    return "clause=none; coordinate=none; status=not-applicable; grade=not-applicable; demand=none; failure=none";
  }
  return [
    `clause=${selected.clauseId}`,
    `coordinate=${selected.coordinate}`,
    `status=${selected.currentStatus}`,
    `grade=${selected.currentGrade}`,
    `demand=${selected.demand}`,
    `failure=${selected.failureDiagnostic ?? "none"}`,
  ].join("; ");
}

async function isFinalModel(message: string): Promise<boolean> {
  const verdict = await callClaude(
    "classifier",
    CLASSIFIER_MODEL,
    "You label messages from an AI assistant that was asked to interview a user and then " +
      "produce a process model. Answer with exactly YES or NO.",
    [
      {
        role: "user",
        content:
          "Does the following message contain the final model deliverable (a complete model " +
          "artifact such as a JSON document or a full structured model specification), as " +
          "opposed to only questions, discussion, or interim summaries?\n\n<message>\n" +
          message +
          "\n</message>",
      },
    ],
    16,
  );
  return verdict.text.trim().toUpperCase().startsWith("YES");
}

const sharedOpeningMessage = await loadSection(`${caseDir}opening-message.md`);
const singleSessionStimulus =
  "This is the only session available for this experiment. No external data or later follow-up will arrive. Please produce the best useful result supportable in this session.";
const openingMessage =
  condition === "3"
    ? `${sharedOpeningMessage}\n\n${singleSessionStimulus}`
    : sharedOpeningMessage;
/**
 * Condition 4's system prompt: the hand-written framing for a prompt-only run,
 * then the harness's own rendering of the repertoire and the SDCPN definition —
 * the same text the binding would put in front of the interviewer, minus the
 * preamble about machinery this run does not have.
 */
async function renderCondition4System(): Promise<string> {
  const harness = (await import("@hashintel/brunch-agent")) as {
    readPluginDefinition: (yaml: string) => unknown;
    readRepertoire: (yaml: string) => unknown;
    renderContract: (definition: unknown) => string[];
    renderGuidance: (repertoire: unknown, definition: unknown) => string[];
    renderRunbook: (
      repertoire: unknown,
      definition: unknown,
      job: "construct" | "review-and-revise",
    ) => string;
  };
  const packagesDir = fileURLToPath(
    new URL("../../../../packages/", import.meta.url),
  );
  const definition = harness.readPluginDefinition(
    await readFile(`${packagesDir}plugin-sdcpn/plugin.yaml`, "utf8"),
  );
  const repertoire = harness.readRepertoire(
    await readFile(`${packagesDir}repertoire/repertoire.yaml`, "utf8"),
  );
  const rendered = [
    ...harness.renderContract(definition),
    ...harness.renderGuidance(repertoire, definition),
    harness.renderRunbook(repertoire, definition, "construct"),
  ].join("\n\n");
  return `${await loadSection("condition-4-prompt.md")}\n\n${rendered}`;
}

const interviewerSystem =
  condition === "2"
    ? await loadSection("v0-prompt.md")
    : condition === "3"
      ? await loadSection("condition-3-prompt.md")
      : condition === "4"
        ? await renderCondition4System()
        : undefined;
const operatorSystem =
  condition === "3"
    ? `${await loadSection("condition-3-operator.md")}\n\n<PROJECTION_ENVELOPE>\n${JSON.stringify(CONDITION_3_OPERATOR_ENVELOPE, null, 2)}\n</PROJECTION_ENVELOPE>\n\n<FROZEN_DEMAND_TABLE>\n${JSON.stringify(CONDITION_3_DEMAND_CLAUSES)}\n</FROZEN_DEMAND_TABLE>\n\n<FROZEN_ACTIVATION_MATRIX>\n${JSON.stringify(CONDITION_3_ACTIVATION_MATRIX)}\n</FROZEN_ACTIVATION_MATRIX>`
    : undefined;
const situationPack = await readFile(`${caseDir}situation-pack.md`, "utf8");
const forceWrapAt =
  condition === "3"
    ? CONDITION_3_STOPPING_RULES.forceWrapAt
    : LEGACY_FORCE_WRAP_AT;
const hardStopAt =
  condition === "3"
    ? CONDITION_3_STOPPING_RULES.hardStopAt
    : LEGACY_HARD_STOP_AT;

let interviewerMessages: ChatMessage[] = [
  condition === "3"
    ? {
        role: "user",
        content: openingMessage,
        expertContent: sharedOpeningMessage,
        experimentStimulus: singleSessionStimulus,
      }
    : { role: "user", content: openingMessage },
];
let stopReason = "hard-stop";

// The expert sees the same conversation from the other side: everything after
// the opening message, roles flipped. Derived on demand rather than kept as a
// parallel array every push had to maintain and resume had to rebuild.
function expertView(): ChatMessage[] {
  return interviewerMessages.slice(1).map((message) => ({
    role:
      message.role === "assistant" ? ("user" as const) : ("assistant" as const),
    content: message.expertContent
      ? `${message.expertContent}${message.experimentStimulus ? `\n\n${message.experimentStimulus}` : ""}`
      : completeMessageContent(message),
  }));
}
let interviewerTurns = 0;
let startedAt = new Date().toISOString();
let preregistration =
  condition === "3"
    ? await loadCondition3Preregistration(startedAt)
    : undefined;
if (mode === "--verify-seal") {
  console.error(
    `condition-3 seal verified: ${preregistration?.sha256} (sealed ${preregistration?.sealedAt}; lock mtime ${preregistration?.modifiedAt})`,
  );
  process.exit(0);
}
await mkdir(transcriptDir, { recursive: true });
const { artifactStem, rawPath, sourceRawPath } = await resolveArtifactPaths();
let recovery: RawCheckpoint["recovery"] = sourceRawPath
  ? {
      mode: mode === "--continue-final" ? "continue-final" : "resume",
      sourceRawPath,
      sourceSha256: sha256(await readFile(sourceRawPath, "utf8")),
      seams: [],
    }
  : undefined;
let impatienceProbeTurn: number | undefined;
let noProgressClosePending = false;

if (mode === "fresh" && existsSync(rawPath)) {
  // The checkpoint is also the run's only record; an unguarded fresh run
  // overwrites hours of paid transcript on its first in-progress write.
  console.error(
    `${rawPath} already exists — a fresh run would overwrite it. ` +
      "Use --resume (or --continue-final), or move the transcripts for this condition aside first.",
  );
  process.exit(1);
}

if (mode !== "fresh") {
  const checkpoint = JSON.parse(
    await readFile(sourceRawPath ?? rawPath, "utf8"),
  ) as RawCheckpoint;
  if (condition === "3") {
    if (!preregistration) {
      throw new Error("condition-3 current preregistration is unavailable");
    }
    assertCondition3CheckpointBinding(checkpoint, preregistration);
    assertCondition3CheckpointSemantics(checkpoint);
  }
  interviewerMessages = checkpoint.interviewerMessages;
  calls.push(...checkpoint.calls);
  interviewerTurns = interviewerMessages.filter(
    (message) => message.role === "assistant",
  ).length;
  startedAt = checkpoint.startedAt;
  stopReason = checkpoint.stopReason;
  if (condition === "3") {
    if (
      !checkpoint.preregistration ||
      !checkpoint.operatorProjections ||
      !checkpoint.operatorAttempts
    ) {
      throw new Error(
        "condition-3 checkpoint lacks preregistration or operator trace",
      );
    }
    operatorProjections.push(...checkpoint.operatorProjections);
    operatorAttempts.push(...checkpoint.operatorAttempts);
    impatienceProbeTurn = checkpoint.impatienceProbeTurn;
    noProgressClosePending =
      checkpoint.stopReason === "no-progress-hard-stop-pending-delivery";
  }
}

function writeCheckpoint(reason: string): Promise<void> {
  const checkpoint: RawCheckpoint = {
    startedAt,
    condition,
    stopReason: reason,
    calls,
    interviewerMessages,
    ...(condition === "3"
      ? {
          instrumentVersion: CONDITION_3_INSTRUMENT_VERSION,
          demandTableVersion: CONDITION_3_DEMAND_TABLE_VERSION,
          modelConfiguration: {
            ...CONDITION_3_MODEL_CONFIGURATION,
          },
          preregistration,
          operatorProjections,
          operatorAttempts,
          impatienceProbeTurn,
          genQ02Layer2: CONDITION_3_GEN_Q02_LAYER_2,
          recovery,
        }
      : {}),
  };
  return writeFile(rawPath, JSON.stringify(checkpoint, null, 2));
}

async function writeArtifacts(): Promise<void> {
  // input_tokens excludes cache reads and writes, so summing it alone
  // undercounts what the run actually paid for. Count all three.
  const totals = calls.reduce(
    (accumulator, call) => {
      accumulator.input += call.usage.input_tokens;
      accumulator.cacheWrite += call.usage.cache_creation_input_tokens ?? 0;
      accumulator.cacheRead += call.usage.cache_read_input_tokens ?? 0;
      accumulator.output += call.usage.output_tokens;
      return accumulator;
    },
    { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
  );

  const header = [
    `# Baseline control — condition ${condition} (${condition === "1" ? "bare" : condition === "2" ? "v0 prompt" : condition === "3" ? "completion + reviewed guidance" : "rendered repertoire + plugin definition, prompt only"})`,
    "",
    `- Run started: ${startedAt}`,
    `- Interviewer: ${INTERVIEWER_MODEL}${
      condition === "2"
        ? " + v0-prompt.md"
        : condition === "3"
          ? " + condition-3-prompt.md"
          : condition === "4"
            ? " + condition-4-prompt.md + rendered repertoire.yaml + plugin-sdcpn/plugin.yaml (see condition-4-system.md)"
            : " (no system prompt)"
    }`,
    `- Simulated expert: ${EXPERT_MODEL} + situation-pack.md`,
    ...(condition === "3"
      ? [
          `- Test-only operator: ${OPERATOR_MODEL}; ${CONDITION_3_INSTRUMENT_VERSION}`,
          `- Frozen DemandTable: ${CONDITION_3_DEMAND_TABLE_VERSION}`,
          `- Preregistration SHA-256: ${preregistration?.sha256 ?? "missing"}`,
          `- Sampling/seed: ${CONDITION_3_STOPPING_RULES.providerSampling}`,
          `- Interviewer turns: ${interviewerTurns} (phase-triggered impatience probe at ${impatienceProbeTurn ?? "not triggered"}, forced wrap at ${forceWrapAt})`,
        ]
      : [
          `- Interviewer turns: ${interviewerTurns} (impatience probe at ${LEGACY_IMPATIENCE_AT}, forced wrap at ${forceWrapAt})`,
        ]),
    `- Stop reason: ${stopReason}`,
    `- Tokens: ${totals.input} in (+${totals.cacheWrite} cache write, +${totals.cacheRead} cache read) / ${totals.output} out across ${calls.length} calls`,
    "",
    "---",
    "",
  ].join("\n");

  const body = interviewerMessages
    .map((message, index) => {
      const speaker =
        message.role === "assistant"
          ? "**Interviewer**"
          : message.experimentStimulus && !message.expertContent
            ? "**Injected experiment stimulus (not expert evidence)**"
            : index === 0
              ? "**Opening message**"
              : "**Expert (Marta)**";
      if (message.expertContent) {
        const stimulus = message.experimentStimulus
          ? `\n\n**Injected experiment stimulus (not expert evidence)**:\n\n${message.experimentStimulus}`
          : "";
        const diagnostic = message.operatorDiagnostic
          ? `\n\n**Test-only operator diagnostic (shown to interviewer)**:\n\n${message.operatorDiagnostic}`
          : "";
        return `${speaker}:\n\n${message.expertContent}${stimulus}${diagnostic}`;
      }
      const continuationText = (message.continuations ?? [])
        .map(
          (continuation, continuationIndex) =>
            `\n\n<!-- append-only continuation seam ${continuationIndex + 1}; prior truncated marker preserved -->\n\n${continuation.content}`,
        )
        .join("");
      return `${speaker}:\n\n${message.content}${continuationText}`;
    })
    .join("\n\n---\n\n");

  await writeFile(`${transcriptDir}/${artifactStem}.md`, header + body + "\n");
  if (condition === "4" && interviewerSystem !== undefined) {
    await writeFile(
      `${transcriptDir}/${artifactStem}-system.md`,
      `# Condition 4 — assembled interviewer system prompt\n\n${interviewerSystem}\n`,
    );
  }
  await writeCheckpoint(stopReason);
  if (condition === "3") {
    await writeFile(
      `${transcriptDir}/${artifactStem}.operator.json`,
      JSON.stringify(
        {
          instrumentVersion: CONDITION_3_INSTRUMENT_VERSION,
          demandTableVersion: CONDITION_3_DEMAND_TABLE_VERSION,
          preregistration,
          genQ02Layer2: CONDITION_3_GEN_Q02_LAYER_2,
          projections: operatorProjections,
          attempts: operatorAttempts,
        },
        null,
        2,
      ),
    );
  }

  // The model artifact is the interviewer's final delivery message, verbatim.
  // Extracting "the model" out of it (the old largest-fenced-block heuristic)
  // depended on the delivery's formatting whims — one run fenced its whole
  // model, the other delivered structured markdown with small illustrative
  // fences, and the heuristic shipped a 517-byte fragment as that run's
  // artifact. The delivery document is self-describing; readers compare the
  // two conditions' documents directly.
  const finalMessage = interviewerMessages.at(-1);
  if (
    stopReason.startsWith("delivered") &&
    finalMessage?.role === "assistant"
  ) {
    await writeFile(
      `${transcriptDir}/${artifactStem}-model.txt`,
      finalMessage.content +
        (finalMessage.continuations ?? [])
          .map((continuation) => continuation.content)
          .join(""),
    );
  } else if (stopReason.startsWith("delivered")) {
    // The transcript header claims a delivery, so a missing artifact must be
    // loud — hours of paid run otherwise end with the main deliverable
    // silently absent.
    console.error(
      `⚠ stop reason is '${stopReason}' but the transcript does not end with an interviewer ` +
        `message — ${artifactStem}-model.txt was NOT written`,
    );
  }

  console.error(
    `done: ${stopReason} after ${interviewerTurns} interviewer turns; ` +
      `${totals.input} in (+${totals.cacheWrite} cache write, +${totals.cacheRead} cache read) / ` +
      `${totals.output} out`,
  );
}

async function appendCondition3ExpertAnswer(
  rawExpertText: string,
  turn: number,
): Promise<boolean> {
  const priorProjection = operatorProjections.at(-1);
  const floorPassed =
    priorProjection !== undefined &&
    priorProjection.assessments
      .filter((assessment) => assessment.clauseId.startsWith("SF-"))
      .every((assessment) => assessment.pass);
  const expertText =
    impatienceProbeTurn === undefined &&
    floorPassed &&
    priorProjection.activeObjectiveRows.length > 0
      ? `${rawExpertText}\n\n${IMPATIENCE_LINE}`
      : rawExpertText;
  if (expertText !== rawExpertText) impatienceProbeTurn = turn;

  const evidenceMessages = [
    ...interviewerMessages,
    {
      role: "user" as const,
      content: expertText,
      expertContent: rawExpertText,
      ...(expertText !== rawExpertText
        ? { experimentStimulus: IMPATIENCE_LINE }
        : {}),
    },
  ];
  let projection: Condition3Projection;
  try {
    projection = await callCondition3Operator(
      operatorSystem ?? "",
      evidenceMessages,
      turn,
    );
  } catch (error) {
    interviewerMessages.push({
      role: "user",
      content: expertText,
      expertContent: rawExpertText,
      ...(expertText !== rawExpertText
        ? { experimentStimulus: IMPATIENCE_LINE }
        : {}),
    });
    stopReason = "operator-projection-failure";
    console.error(error);
    await writeArtifacts();
    process.exit(1);
  }

  const noProgressStreak = nextCondition3NoProgressStreak(
    operatorProjections,
    projection,
    turn,
    priorProjection?.noProgressStreak ?? 0,
  );
  const matches = activationMatches(projection);
  const previouslySelectedUnsupportedLabels = new Set(
    operatorProjections.flatMap(({ selectedUnsupportedAnchorLabel }) =>
      selectedUnsupportedAnchorLabel === null
        ? []
        : [selectedUnsupportedAnchorLabel],
    ),
  );
  const selectedUnsupportedAnchor =
    projection.unsupportedActiveObjectiveAnchors.find(
      ({ label, state }) =>
        state === "active" && !previouslySelectedUnsupportedLabels.has(label),
    );
  const selected = selectedUnsupportedAnchor
    ? null
    : selectedAssessment(projection);
  const selectedMatch = selected
    ? matches.find((match) => match.clauseId === selected.clauseId)
    : undefined;
  const projectionRecord: Condition3ProjectionRecord = {
    ...projection,
    turn,
    recordedAt: new Date().toISOString(),
    selectedClauseId: (selected?.clauseId as Condition3ClauseId) ?? null,
    selectedUnsupportedAnchorLabel: selectedUnsupportedAnchor?.label ?? null,
    selectedCardId: selectedMatch?.cardId ?? null,
    selectedPredicate: selectedMatch?.predicate ?? null,
    activationMatches: matches,
    noProgressStreak,
    noProgressAdvisory:
      noProgressStreak >= CONDITION_3_STOPPING_RULES.noProgressAdvisoryAfter,
  };
  operatorProjections.push(projectionRecord);
  const operatorDiagnostic = renderOperatorDiagnostic(projectionRecord);
  const sessionAdvisory = projectionRecord.noProgressAdvisory
    ? `\n\n<test-only-session-advisory>NP: ${noProgressStreak} consecutive non-material expert frames. This does not assert completion.</test-only-session-advisory>`
    : "";
  interviewerMessages.push({
    role: "user",
    content: `${expertText}\n\n<test-only-completion-diagnostic>${operatorDiagnostic}</test-only-completion-diagnostic>${sessionAdvisory}`,
    expertContent: rawExpertText,
    ...(expertText !== rawExpertText
      ? { experimentStimulus: IMPATIENCE_LINE }
      : {}),
    operatorDiagnostic: operatorDiagnostic + sessionAdvisory,
  });
  if (noProgressStreak >= CONDITION_3_STOPPING_RULES.noProgressHardStopAfter) {
    const closeInstruction =
      "NP hard stop: do not ask another question. Produce the best useful result supportable now, with explicit gaps and claim limits; delivery does not assert completion.";
    const finalMessage = interviewerMessages.at(-1);
    if (finalMessage?.role === "user") {
      finalMessage.content += `\n\n<test-only-session-hard-stop>${closeInstruction}</test-only-session-hard-stop>`;
      finalMessage.operatorDiagnostic = `${finalMessage.operatorDiagnostic ?? ""}\n\n${closeInstruction}`;
    }
    stopReason = "no-progress-hard-stop-pending-delivery";
    await writeCheckpoint(stopReason);
    return true;
  }
  return false;
}

if (mode === "--continue-final") {
  const final = interviewerMessages.at(-1);
  if (
    final?.role !== "assistant" ||
    !final.truncated ||
    !stopReason.endsWith("-incomplete") ||
    (condition === "3" && !stopReason.startsWith("delivered"))
  ) {
    console.error(
      "checkpoint does not end with a truncated interviewer message; nothing to continue",
    );
    process.exit(1);
  }
  const priorMessages = interviewerMessages.slice(0, -1);
  const combinedFinalContent =
    final.content +
    (final.continuations ?? [])
      .map((continuation) => continuation.content)
      .join("");
  const continued = await callInterviewer(interviewerSystem, [
    ...priorMessages,
    { role: "assistant", content: combinedFinalContent },
    { role: "user", content: CONTINUE_MESSAGE },
  ]);
  if (condition === "3") {
    const newContinuationPieces = continued.sourceText
      ? [
          {
            content: continued.sourceText,
            truncated: true,
            recordedAt: new Date().toISOString(),
          },
          ...(continued.continuations ?? []),
        ]
      : [
          {
            content: continued.text,
            truncated: continued.truncated,
            recordedAt: new Date().toISOString(),
          },
        ];
    final.continuations = [
      ...(final.continuations ?? []),
      ...newContinuationPieces,
    ];
    recovery?.seams.push({
      kind: "final-continuation",
      sourceHadTruncationMarker: true,
      sourceContent: combinedFinalContent,
      recordedAt: new Date().toISOString(),
    });
  } else {
    // Legacy checkpoints retain their reviewed in-place merge behavior.
    final.content += continued.text;
  }
  if (continued.truncated) {
    console.error(
      "⚠ still truncated after this continuation — run --continue-final again",
    );
  } else if (condition !== "3") {
    delete final.truncated;
  }
  if (!continued.truncated && stopReason.endsWith("-incomplete")) {
    stopReason = stopReason.slice(0, -"-incomplete".length);
  }
  await writeArtifacts();
  process.exit(0);
}

if (mode === "--resume") {
  const resumeAfterForcedWrap =
    condition === "3" && stopReason === "forced-wrap-in-progress";
  // A delivered checkpoint must never resume: doing so would pop and regenerate the paid
  // final delivery, then overwrite the transcript. Check the durable reason rather than the
  // trailing role because a capped non-final interviewer turn also ends with an assistant.
  if (
    condition === "3" &&
    ![
      "in-progress",
      "expert-truncated",
      "interviewer-truncated",
      "no-progress-hard-stop-pending-delivery",
      "forced-wrap-in-progress",
    ].includes(stopReason)
  ) {
    console.error(
      `condition 3 ended '${stopReason}' — this terminal checkpoint cannot resume`,
    );
    process.exit(1);
  }
  if (stopReason.startsWith("delivered")) {
    console.error(
      `condition ${condition} already ended '${stopReason}' — resuming would regenerate and ` +
        "overwrite its final delivery. Use --continue-final to finish a truncated delivery, " +
        "or move the transcripts aside to rerun from scratch.",
    );
    process.exit(1);
  }
  if (stopReason === "expert-truncated") {
    const partialExpertReply = interviewerMessages.at(-1);
    if (partialExpertReply?.role !== "user" || !partialExpertReply.truncated) {
      console.error(
        "checkpoint says 'expert-truncated' but does not end with a truncated expert reply",
      );
      process.exit(1);
    }
    if (condition === "3") {
      recovery?.seams.push({
        kind: "truncated-expert-regeneration",
        sourceHadTruncationMarker: true,
        sourceContent: partialExpertReply.content,
        recordedAt: new Date().toISOString(),
      });
    }
    // The partial text remains in the stopped checkpoint as evidence, but must never be fed
    // to the interviewer as a complete answer. Resume removes it and retries the expert call
    // against the same preceding interviewer question.
    interviewerMessages.pop();
    console.error(
      `regenerating truncated expert reply at interviewer turn ${interviewerTurns}`,
    );
    const expertResult = await callClaude(
      "expert",
      EXPERT_MODEL,
      situationPack,
      expertView(),
      1_500,
    );
    let expertText = expertResult.text;
    if (condition !== "3" && interviewerTurns === LEGACY_IMPATIENCE_AT) {
      expertText = `${expertText}\n\n${IMPATIENCE_LINE}`;
    }
    if (expertResult.truncated) {
      interviewerMessages.push({
        role: "user",
        content: expertText,
        truncated: true,
      });
      console.error(
        "⚠ the regenerated expert reply is still truncated — checkpointed the partial reply " +
          "without sending it to the interviewer; rerun with --resume to try again",
      );
      await writeArtifacts();
      process.exit(0);
    }
    if (condition === "3") {
      const stopped = await appendCondition3ExpertAnswer(
        expertText,
        interviewerTurns,
      );
      if (stopped) {
        noProgressClosePending = true;
      }
    } else {
      interviewerMessages.push({ role: "user", content: expertText });
    }
    if (!noProgressClosePending) await writeCheckpoint("in-progress");
  }
  // Checkpoints are written after complete exchanges only, but tolerate a trailing
  // assistant message by regenerating that turn.
  if (!noProgressClosePending) stopReason = "hard-stop";
  const last = interviewerMessages.at(-1);
  if (last?.role === "assistant" && !resumeAfterForcedWrap) {
    if (condition === "3" && last.truncated) {
      recovery?.seams.push({
        kind: "truncated-interviewer-regeneration",
        sourceHadTruncationMarker: true,
        sourceContent:
          last.content +
          (last.continuations ?? [])
            .map((continuation) => continuation.content)
            .join(""),
        recordedAt: new Date().toISOString(),
      });
    }
    interviewerMessages.pop();
  }
  interviewerTurns = interviewerMessages.filter(
    (message) => message.role === "assistant",
  ).length;
  console.error(
    `resuming condition ${condition} at interviewer turn ${interviewerTurns + 1}`,
  );
}

while (interviewerTurns < hardStopAt) {
  interviewerTurns++;
  if (
    condition === "3" &&
    interviewerTurns >= forceWrapAt &&
    !noProgressClosePending &&
    interviewerMessages.at(-1)?.experimentStimulus !== FORCED_WRAP_MESSAGE
  ) {
    interviewerMessages.push({
      role: "user",
      content: `<EXPERIMENT_STIMULUS>${FORCED_WRAP_MESSAGE}</EXPERIMENT_STIMULUS>`,
      experimentStimulus: FORCED_WRAP_MESSAGE,
    });
  }
  console.error(`turn ${interviewerTurns} (interviewer)`);
  const interviewer = await callInterviewer(
    interviewerSystem,
    interviewerMessages,
  );
  interviewerMessages.push({
    role: "assistant",
    content: interviewer.sourceText ?? interviewer.text,
    ...(interviewer.sourceText || interviewer.truncated
      ? { truncated: true as const }
      : {}),
    ...(interviewer.continuations
      ? { continuations: interviewer.continuations }
      : {}),
  });

  if (await isFinalModel(interviewer.text)) {
    stopReason = noProgressClosePending
      ? "delivered-after-no-progress-hard-stop"
      : interviewerTurns >= forceWrapAt
        ? "delivered-after-forced-wrap"
        : "delivered";
    if (interviewer.truncated) {
      stopReason += "-incomplete";
      console.error(
        "⚠ the final delivery is still truncated after stitching — " +
          "rerun with --continue-final to finish it",
      );
    }
    break;
  }

  if (noProgressClosePending) {
    stopReason = interviewer.truncated
      ? "no-progress-hard-stop-undelivered-incomplete"
      : "no-progress-hard-stop-undelivered";
    break;
  }

  if (interviewer.truncated) {
    stopReason = "interviewer-truncated";
    console.error(
      "⚠ the non-final interviewer reply is truncated after the continuation cap — " +
        "checkpointed it without sending the partial question to the expert; rerun with " +
        "--resume to regenerate the interviewer turn",
    );
    break;
  }

  if (condition === "3" && interviewerTurns >= forceWrapAt) {
    if (interviewerTurns < hardStopAt) {
      await writeCheckpoint("forced-wrap-in-progress");
    }
    continue;
  }

  let expertText: string;
  let expertTruncated = false;
  if (interviewerTurns >= forceWrapAt) {
    expertText = FORCED_WRAP_MESSAGE;
  } else {
    console.error(`turn ${interviewerTurns} (expert)`);
    const expertResult = await callClaude(
      "expert",
      EXPERT_MODEL,
      situationPack,
      expertView(),
      1_500,
    );
    expertText = expertResult.text;
    expertTruncated = expertResult.truncated;
    if (condition !== "3" && interviewerTurns === LEGACY_IMPATIENCE_AT) {
      expertText = `${expertText}\n\n${IMPATIENCE_LINE}`;
    }
  }
  if (condition === "3" && !expertTruncated) {
    const stopped = await appendCondition3ExpertAnswer(
      expertText,
      interviewerTurns,
    );
    if (stopped) {
      noProgressClosePending = true;
      continue;
    }
  } else {
    interviewerMessages.push({
      role: "user",
      content: expertText,
      ...(expertTruncated ? { truncated: true as const } : {}),
    });
  }
  if (expertTruncated) {
    stopReason = "expert-truncated";
    console.error(
      "⚠ the expert reply is truncated — checkpointed the partial reply without sending it " +
        "to the interviewer; rerun with --resume to regenerate it",
    );
    break;
  }
  await writeCheckpoint("in-progress");
}

if (stopReason === "no-progress-hard-stop-pending-delivery") {
  throw new Error(
    "condition-3 invariant violated: the no-progress closing interviewer turn exceeded the hard budget",
  );
}
await writeArtifacts();
