// Baseline interview runner (FE-1361) for the prompt-only conditions.
//
// Conditions 1 and 2 preserve the reviewed FE-1361 controls: bare Claude and the v0 elicitation
// prompt. Condition 4 is the ADR-0007 teaching layer as prompt only. Condition 5 — the shipped
// harness in the loop — runs from `harness-run.ts`. Condition 3 (the FE-1404 preregistered
// completion-and-guidance instrument with a test-only operator projection) was retired without a
// run and its code removed on 2026-08-26; `condition-3-preregistration.md` and
// `condition-3-prompt.md` remain as the record of what was planned.
//
// Usage: ANTHROPIC_API_KEY=... node --experimental-strip-types run.ts <1|2|4> [--resume|--continue-final]
//   Condition 4's interviewer system prompt is condition-4-prompt.md plus the harness's rendering of
//   the repertoire and the SDCPN plugin definition (contract, guidance, construct runbook), with no
//   harness machinery behind it. It reads the rendering from `@hashintel/brunch-agent`'s built
//   output, so run `turbo build` first.
//   --resume          continue an interrupted run from its checkpoint
//   --continue-final  ask the interviewer to finish a final delivery that was cut off at max_tokens
//
// Production outputs, under docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/:
//   condition-<n>.md        readable transcript with run metadata
//   condition-<n>.raw.json  full message arrays + per-call token usage (also the checkpoint)
//   condition-<n>-model.txt the final delivery message, verbatim (delivered runs only)

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type Anthropic from "@anthropic-ai/sdk";

const INTERVIEWER_MODEL = "claude-opus-5";
const EXPERT_MODEL = "claude-sonnet-5";
const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

// Interviewer turns, not exchanges. ReqElicitGym budgets 20; we force a wrap-up at 20 and
// hard-stop at 24 in case the model keeps talking instead of delivering.
const FORCE_WRAP_AT = 20;
const HARD_STOP_AT = 24;
// The scripted impatience probe (LLMREI: interviewers end too readily on impatience cues).
// Appended to the expert's reply on this exchange, identically in every condition.
const IMPATIENCE_AT = 8;
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
};

type Usage = Pick<Anthropic.Usage, "input_tokens" | "output_tokens"> &
  Partial<
    Pick<
      Anthropic.Usage,
      "cache_creation_input_tokens" | "cache_read_input_tokens"
    >
  >;

interface CallRecord {
  agent: "interviewer" | "expert" | "classifier";
  model: Anthropic.Model;
  usage: Usage;
}

interface CallResult {
  text: string;
  truncated: boolean;
}

interface RawCheckpoint {
  startedAt: string;
  condition: "1" | "2" | "4";
  stopReason: string;
  calls: CallRecord[];
  interviewerMessages: ChatMessage[];
}

function usage(): never {
  console.error("usage: node run.ts <1|2|4> [--resume|--continue-final]");
  process.exit(1);
}

const conditionArg = process.argv[2];
const mode = process.argv[3] ?? "fresh";
if (conditionArg !== "1" && conditionArg !== "2" && conditionArg !== "4")
  usage();
if (mode !== "fresh" && mode !== "--resume" && mode !== "--continue-final")
  usage();
const condition = conditionArg;
const clientModule = process.env["BRUNCH_BASELINE_ANTHROPIC_MODULE"];
const testOutputDirectory = process.env["BRUNCH_BASELINE_TEST_OUTPUT_DIR"];
const apiKey = process.env["ANTHROPIC_API_KEY"];
if (testOutputDirectory && !clientModule) {
  console.error(
    "BRUNCH_BASELINE_TEST_OUTPUT_DIR requires BRUNCH_BASELINE_ANTHROPIC_MODULE",
  );
  process.exit(1);
}
if (!apiKey && !clientModule) {
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
      // Project persistence metadata out of the provider request.
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
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
    // No separator at the seam: the cut usually lands mid-line or mid-token
    // and the model is instructed to continue exactly from where it stopped,
    // so an injected newline would corrupt the merged document.
    text += result.text;
  }
  return { text, truncated: result.truncated };
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

const openingMessage = await loadSection(`${caseDir}opening-message.md`);

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
    : condition === "4"
      ? await renderCondition4System()
      : undefined;
const situationPack = await readFile(`${caseDir}situation-pack.md`, "utf8");

let interviewerMessages: ChatMessage[] = [
  { role: "user", content: openingMessage },
];
let stopReason = "hard-stop";

// The expert sees the same conversation from the other side: everything after
// the opening message, roles flipped. Derived on demand rather than kept as a
// parallel array every push had to maintain and resume had to rebuild.
function expertView(): ChatMessage[] {
  return interviewerMessages.slice(1).map((message) => ({
    role:
      message.role === "assistant" ? ("user" as const) : ("assistant" as const),
    content: message.content,
  }));
}
let interviewerTurns = 0;
let startedAt = new Date().toISOString();
await mkdir(transcriptDir, { recursive: true });
const artifactStem = `condition-${condition}`;
const rawPath = `${transcriptDir}/${artifactStem}.raw.json`;

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
    await readFile(rawPath, "utf8"),
  ) as RawCheckpoint;
  interviewerMessages = checkpoint.interviewerMessages;
  calls.push(...checkpoint.calls);
  interviewerTurns = interviewerMessages.filter(
    (message) => message.role === "assistant",
  ).length;
  startedAt = checkpoint.startedAt;
  stopReason = checkpoint.stopReason;
}

function writeCheckpoint(reason: string): Promise<void> {
  const checkpoint: RawCheckpoint = {
    startedAt,
    condition,
    stopReason: reason,
    calls,
    interviewerMessages,
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
    `# Baseline control — condition ${condition} (${condition === "1" ? "bare" : condition === "2" ? "v0 prompt" : "rendered repertoire + plugin definition, prompt only"})`,
    "",
    `- Run started: ${startedAt}`,
    `- Interviewer: ${INTERVIEWER_MODEL}${
      condition === "2"
        ? " + v0-prompt.md"
        : condition === "4"
          ? " + condition-4-prompt.md + rendered repertoire.yaml + plugin-sdcpn/plugin.yaml (see condition-4-system.md)"
          : " (no system prompt)"
    }`,
    `- Simulated expert: ${EXPERT_MODEL} + situation-pack.md`,
    `- Interviewer turns: ${interviewerTurns} (impatience probe at ${IMPATIENCE_AT}, forced wrap at ${FORCE_WRAP_AT})`,
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
          : index === 0
            ? "**Opening message**"
            : "**Expert (Marta)**";
      return `${speaker}:\n\n${message.content}`;
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

  // The model artifact is the interviewer's final delivery message, verbatim.
  // Extracting "the model" out of it (the old largest-fenced-block heuristic)
  // depended on the delivery's formatting whims — one run fenced its whole
  // model, the other delivered structured markdown with small illustrative
  // fences, and the heuristic shipped a 517-byte fragment as that run's
  // artifact. The delivery document is self-describing; readers compare the
  // conditions' documents directly.
  const finalMessage = interviewerMessages.at(-1);
  if (
    stopReason.startsWith("delivered") &&
    finalMessage?.role === "assistant"
  ) {
    await writeFile(
      `${transcriptDir}/${artifactStem}-model.txt`,
      finalMessage.content,
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

if (mode === "--continue-final") {
  const final = interviewerMessages.at(-1);
  if (
    final?.role !== "assistant" ||
    !final.truncated ||
    !stopReason.endsWith("-incomplete")
  ) {
    console.error(
      "checkpoint does not end with a truncated interviewer message; nothing to continue",
    );
    process.exit(1);
  }
  const priorMessages = interviewerMessages.slice(0, -1);
  const continued = await callInterviewer(interviewerSystem, [
    ...priorMessages,
    { role: "assistant", content: final.content },
    { role: "user", content: CONTINUE_MESSAGE },
  ]);
  final.content += continued.text;
  if (continued.truncated) {
    console.error(
      "⚠ still truncated after this continuation — run --continue-final again",
    );
  } else {
    delete final.truncated;
    stopReason = stopReason.slice(0, -"-incomplete".length);
  }
  await writeArtifacts();
  process.exit(0);
}

if (mode === "--resume") {
  // A delivered checkpoint must never resume: doing so would pop and regenerate the paid
  // final delivery, then overwrite the transcript. Check the durable reason rather than the
  // trailing role because a capped non-final interviewer turn also ends with an assistant.
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
    if (interviewerTurns === IMPATIENCE_AT) {
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
    interviewerMessages.push({ role: "user", content: expertText });
    await writeCheckpoint("in-progress");
  }
  // Checkpoints are written after complete exchanges only, but tolerate a trailing
  // assistant message by regenerating that turn.
  stopReason = "hard-stop";
  if (interviewerMessages.at(-1)?.role === "assistant") {
    interviewerMessages.pop();
  }
  interviewerTurns = interviewerMessages.filter(
    (message) => message.role === "assistant",
  ).length;
  console.error(
    `resuming condition ${condition} at interviewer turn ${interviewerTurns + 1}`,
  );
}

while (interviewerTurns < HARD_STOP_AT) {
  interviewerTurns++;
  console.error(`turn ${interviewerTurns} (interviewer)`);
  const interviewer = await callInterviewer(
    interviewerSystem,
    interviewerMessages,
  );
  interviewerMessages.push({
    role: "assistant",
    content: interviewer.text,
    ...(interviewer.truncated ? { truncated: true as const } : {}),
  });

  if (await isFinalModel(interviewer.text)) {
    stopReason =
      interviewerTurns >= FORCE_WRAP_AT
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

  if (interviewer.truncated) {
    stopReason = "interviewer-truncated";
    console.error(
      "⚠ the non-final interviewer reply is truncated after the continuation cap — " +
        "checkpointed it without sending the partial question to the expert; rerun with " +
        "--resume to regenerate the interviewer turn",
    );
    break;
  }

  let expertText: string;
  let expertTruncated = false;
  if (interviewerTurns >= FORCE_WRAP_AT) {
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
    if (interviewerTurns === IMPATIENCE_AT) {
      expertText = `${expertText}\n\n${IMPATIENCE_LINE}`;
    }
  }
  interviewerMessages.push({
    role: "user",
    content: expertText,
    ...(expertTruncated ? { truncated: true as const } : {}),
  });
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

await writeArtifacts();
