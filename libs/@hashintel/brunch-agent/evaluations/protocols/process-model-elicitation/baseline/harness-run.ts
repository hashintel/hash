/**
 * Baseline condition 5 — the harness in the loop.
 *
 * The same simulated expert, probes, and turn budget as conditions 1–4, but
 * the interviewer is the shipped SDCPN elicitor running in the Flue runtime
 * with the binding's machinery: the `ask` suspension, the settlement nudge,
 * the private `sweep` extraction into the capture store, and the harness's
 * computed completion. The runner plays the expert and the clock. It reads
 * every harness fact from durable history and the capture store, never
 * interpolates into the interviewer's instructions, and needs no delivery
 * classifier: the deliverable is the capture store, folded, and the
 * interviewer ends its own turn-taking by replying without a question.
 *
 * This is the JS-API workflow pattern the Flue routing table names for a loop
 * that drives an agent through turns: `start()`, then `send()`/`wait()`/
 * `history()` through the SDK client over the app's own router.
 *
 * Usage, from `apps/brunch-agent` after `turbo run build` for the workspace:
 *
 *     yarn baseline:harness
 *
 * Environment:
 *
 *     ANTHROPIC_API_KEY                            both models (pi-ai reads it for the interviewer)
 *     BRUNCH_SDCPN_MODEL                           interviewer model id; this runner defaults it to claude-opus-5
 *     BRUNCH_BASELINE_ANTHROPIC_MODULE             test-only stand-in for the expert's Anthropic client
 *     BRUNCH_BASELINE_INTERVIEWER_PROVIDER_MODULE  test-only pi provider module (default export) for the interviewer
 *     BRUNCH_BASELINE_HARD_STOP                     positive interviewer-turn limit; defaults to 24
 *     BRUNCH_BASELINE_OUTPUT_DIR                   optional run-specific production output directory
 *     BRUNCH_BASELINE_TEST_OUTPUT_DIR              test-only output directory; requires both stand-ins
 *
 * Artifacts (beside the other conditions' transcripts unless the test directory is set):
 *
 *     condition-5.md              the readable transcript, harness facts interleaved
 *     condition-5.raw.json        every turn record, the Flue history snapshot, the store, and usage
 *     condition-5-model.md        the capture store folded into the elicited model, with the completion report
 *     condition-5-captures.json   the capture-store snapshot verbatim
 *     condition-5-system.md       the interviewer's instructions, reconstructed with the binding's own functions
 *     condition-5.timings.jsonl   each observed Flue model call, tagged by interviewer-turn purpose
 */

import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { observe } from "@flue/runtime";
import { start } from "@flue/runtime/node";
import {
  createFlueClient,
  type FlueConversationMessage,
  type FlueConversationSnapshot,
} from "@flue/sdk";

import {
  askProtocolInstructionFragments,
  buildCompletionCueSignal,
  buildSweepList,
  completionDemands,
  evaluateCompletion,
  foldElicitedModel,
  pendingAskAffordanceId,
  renderInstructions,
  settlementProtocolInstructionFragments,
  toolName,
  type CaptureStoreSnapshot,
  type CompletionReport,
  type ElicitedModel,
  type SlotState,
} from "@hashintel/brunch-agent";
import {
  createLocalCaptureStore,
  projectFlueHistoryForSweep,
} from "@hashintel/brunch-agent-binding-flue";
import { sdcpn, sdcpnDefinition } from "@hashintel/brunch-agent-plugin-sdcpn";
import { repertoire } from "@hashintel/brunch-agent-repertoire";

import {
  createTurnTimingRecorder,
  type TurnTimingPurpose,
  type TurnTimingRecord,
} from "./turn-timing.ts";

import type Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "@earendil-works/pi-ai";

// ---------------------------------------------------------------------------
// Protocol constants — identical to conditions 1, 2, and 4 (run.ts).
// ---------------------------------------------------------------------------

const CONDITION = "5";
const EXPERT_MODEL = "claude-sonnet-5";
const DEFAULT_INTERVIEWER_MODEL = "claude-opus-5";
const FORCE_WRAP_AT = 20;
const DEFAULT_HARD_STOP_AT = 24;
const IMPATIENCE_AT = 8;
const IMPATIENCE_LINE =
  "(Sorry — I've just seen the time, I have the floor huddle in ten minutes. How much more do you need?)";
const FORCED_WRAP_MESSAGE =
  "I really do have to stop here. Please produce the model now with everything you have.";
/** Consecutive interviewer turns without a question, before the wrap, that end the run. */
const STALL_AFTER_TURNS_WITHOUT_ASK = 3;
const EXPERT_MAX_TOKENS = 1_500;

// ---------------------------------------------------------------------------
// Environment and stand-ins.
// ---------------------------------------------------------------------------

const outputDirectory = process.env["BRUNCH_BASELINE_OUTPUT_DIR"];
const testOutputDirectory = process.env["BRUNCH_BASELINE_TEST_OUTPUT_DIR"];
const expertClientModule = process.env["BRUNCH_BASELINE_ANTHROPIC_MODULE"];
const interviewerProviderModule =
  process.env["BRUNCH_BASELINE_INTERVIEWER_PROVIDER_MODULE"];
const apiKey = process.env["ANTHROPIC_API_KEY"];
const configuredHardStop = process.env["BRUNCH_BASELINE_HARD_STOP"];
const hardStopAt =
  configuredHardStop === undefined
    ? DEFAULT_HARD_STOP_AT
    : Number(configuredHardStop);

if (!Number.isSafeInteger(hardStopAt) || hardStopAt <= 0) {
  throw new Error("BRUNCH_BASELINE_HARD_STOP must be a positive integer");
}

if (testOutputDirectory && !(expertClientModule && interviewerProviderModule)) {
  console.error(
    "BRUNCH_BASELINE_TEST_OUTPUT_DIR requires BRUNCH_BASELINE_ANTHROPIC_MODULE and BRUNCH_BASELINE_INTERVIEWER_PROVIDER_MODULE",
  );
  process.exit(1);
}
if (!apiKey && !(expertClientModule && interviewerProviderModule)) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}

// The elicitor pins its model at module load, so the override must be in the
// environment before the agent module is imported (below, dynamically).
process.env["BRUNCH_SDCPN_MODEL"] ||= DEFAULT_INTERVIEWER_MODEL;
const interviewerModel = process.env["BRUNCH_SDCPN_MODEL"];

// The capture store lands in a run-private directory; the snapshot is copied
// out as an artifact at the end. Set before the agent's first render.
const targetDocumentDirectory = await mkdtemp(
  join(tmpdir(), "brunch-baseline-c5-"),
);
process.env["BRUNCH_DEV_TARGET_DOCUMENT_DIR"] = targetDocumentDirectory;

const caseDir = fileURLToPath(
  new URL(
    "../../../cases/process-model-elicitation/baseline/",
    import.meta.url,
  ),
);
const transcriptDir =
  testOutputDirectory ??
  outputDirectory ??
  fileURLToPath(
    new URL(
      "../../../../docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/",
      import.meta.url,
    ),
  );
await mkdir(transcriptDir, { recursive: true });
const timingsPath = join(transcriptDir, `condition-${CONDITION}.timings.jsonl`);
await writeFile(timingsPath, "");

// ---------------------------------------------------------------------------
// Records.
// ---------------------------------------------------------------------------

interface ExpertMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  calls: number;
}

export interface HarnessSweepRecord {
  readonly status: string;
  readonly appliedCaptureIds?: readonly string[];
  readonly skippedDedupKeys?: readonly string[];
  readonly advisories?: readonly unknown[];
  readonly refusal?: unknown;
  readonly completion?: unknown;
}

export interface HarnessCompletionRecord {
  readonly captures: number;
  readonly complete: boolean;
  readonly unsatisfied: number;
  readonly outsideSlice: number;
  readonly unmapped: number;
  readonly revision: string;
  readonly cue: string;
}

export interface HarnessTurnRecord {
  readonly turn: number;
  /** Assistant text parts, in order, across every response in the turn. */
  readonly text: readonly string[];
  readonly asks: readonly {
    readonly question: string;
    readonly toolCallId: string;
    readonly rejected?: string;
  }[];
  readonly sweeps: readonly HarnessSweepRecord[];
  readonly signals: readonly {
    readonly tagName: string;
    readonly excerpt: string;
  }[];
  readonly toolErrors: readonly {
    readonly toolName: string;
    readonly errorText: string;
  }[];
  readonly settlement?: "failed" | "aborted";
  /** The one question left open for the expert, if any. */
  readonly pendingQuestion?: string;
  /** Flue model-call timings observed while this interviewer turn ran. */
  readonly timings: readonly TurnTimingRecord[];
  /** The harness's read-time completion over the capture store after this turn. */
  readonly completion: HarnessCompletionRecord;
  /** What the expert was then sent: their reply, or a stimulus. */
  readonly expert?: {
    readonly content: string;
    readonly stimulus?: string;
    readonly truncated?: boolean;
  };
}

export interface HarnessRunRecord {
  readonly startedAt: string;
  readonly condition: typeof CONDITION;
  readonly interviewerModel: string;
  readonly expertModel: string;
  readonly conversationId: string;
  readonly stopReason: string;
  readonly turns: readonly HarnessTurnRecord[];
  readonly timings: readonly TurnTimingRecord[];
  readonly usage: { readonly interviewer: Usage; readonly expert: Usage };
  readonly history: FlueConversationSnapshot;
  readonly store: CaptureStoreSnapshot;
}

// ---------------------------------------------------------------------------
// The expert (unchanged from run.ts: same model, same pack, thinking off).
// ---------------------------------------------------------------------------

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
  anthropic = expertClientModule
    ? ((await import(expertClientModule)).default as BaselineAnthropicClient)
    : (new (await import("@anthropic-ai/sdk")).default({
        apiKey,
        maxRetries: 5,
        timeout: 30 * 60 * 1000,
      }) as BaselineAnthropicClient);
  return anthropic;
}

const expertUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  calls: 0,
};

async function callExpert(
  system: string,
  messages: readonly ExpertMessage[],
): Promise<{ text: string; truncated: boolean }> {
  let tokenBudget = EXPERT_MAX_TOKENS;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await (
      await getAnthropic()
    ).messages.create({
      model: EXPERT_MODEL,
      max_tokens: tokenBudget,
      thinking: { type: "disabled" },
      system,
      messages: messages.map((message) => ({ ...message })),
    });
    expertUsage.calls += 1;
    expertUsage.input += response.usage.input_tokens;
    expertUsage.output += response.usage.output_tokens;
    expertUsage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    expertUsage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (text.trim() === "") {
      tokenBudget *= 2;
      console.error(
        `  expert: empty text, retrying with max_tokens=${tokenBudget}`,
      );
      continue;
    }
    return { text, truncated: response.stop_reason === "max_tokens" };
  }
  throw new Error("expert: exhausted retries");
}

// ---------------------------------------------------------------------------
// Reading harness facts out of durable history and the store.
// ---------------------------------------------------------------------------

const ASK_TOOL = toolName("ask");
const SWEEP_TOOL = toolName("sweep");

const excerpt = (text: string, length = 240): string =>
  text.length > length ? `${text.slice(0, length)}…` : text;

const questionOf = (output: unknown): string | undefined =>
  typeof output === "object" &&
  output !== null &&
  "payload" in output &&
  typeof output.payload === "object" &&
  output.payload !== null &&
  "question" in output.payload &&
  typeof output.payload.question === "string"
    ? output.payload.question
    : undefined;

const sweepRecordOf = (output: unknown): HarnessSweepRecord => {
  const record = (
    typeof output === "object" && output !== null ? output : {}
  ) as Record<string, unknown>;
  return {
    status: typeof record["status"] === "string" ? record["status"] : "unknown",
    ...(Array.isArray(record["appliedCaptureIds"])
      ? { appliedCaptureIds: record["appliedCaptureIds"] as string[] }
      : {}),
    ...(Array.isArray(record["skippedDedupKeys"])
      ? { skippedDedupKeys: record["skippedDedupKeys"] as string[] }
      : {}),
    ...(Array.isArray(record["advisories"])
      ? { advisories: record["advisories"] as unknown[] }
      : {}),
    ...("refusal" in record ? { refusal: record["refusal"] } : {}),
    ...("completion" in record ? { completion: record["completion"] } : {}),
  };
};

/** Everything the interviewer did between two of our dispatches. */
function readTurn(
  messages: readonly FlueConversationMessage[],
): Omit<
  HarnessTurnRecord,
  "turn" | "completion" | "pendingQuestion" | "timings"
> {
  const text: string[] = [];
  const asks: HarnessTurnRecord["asks"][number][] = [];
  const sweeps: HarnessSweepRecord[] = [];
  const signals: HarnessTurnRecord["signals"][number][] = [];
  const toolErrors: HarnessTurnRecord["toolErrors"][number][] = [];
  let settlement: HarnessTurnRecord["settlement"];
  for (const message of messages) {
    if (message.settlement) settlement = message.settlement.outcome;
    if (message.role === "system") {
      const tagName = message.signal?.tagName ?? message.purpose;
      const body = message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("");
      signals.push({ tagName, excerpt: excerpt(body) });
      continue;
    }
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "text") {
        if (part.text.trim().length > 0) text.push(part.text);
        continue;
      }
      if (part.type !== "dynamic-tool") continue;
      if (part.toolName === ASK_TOOL) {
        const input = part.input as { question?: unknown } | undefined;
        const question =
          (part.state === "output-available" && questionOf(part.output)) ||
          (typeof input?.question === "string" ? input.question : "");
        asks.push({
          question,
          toolCallId: part.toolCallId,
          ...(part.state === "output-error"
            ? { rejected: part.errorText }
            : {}),
        });
      } else if (part.toolName === SWEEP_TOOL) {
        if (part.state === "output-available") {
          sweeps.push(sweepRecordOf(part.output));
        } else if (part.state === "output-error") {
          toolErrors.push({
            toolName: part.toolName,
            errorText: part.errorText,
          });
        }
      } else if (part.state === "output-error") {
        toolErrors.push({ toolName: part.toolName, errorText: part.errorText });
      }
    }
  }
  return {
    text,
    asks,
    sweeps,
    signals,
    toolErrors,
    ...(settlement === undefined ? {} : { settlement }),
  };
}

const demands = completionDemands(sdcpnDefinition);

function readCompletion(store: CaptureStoreSnapshot): {
  model: ElicitedModel;
  report: CompletionReport;
  record: HarnessCompletionRecord;
} {
  const model = foldElicitedModel(store, sdcpnDefinition);
  const report = evaluateCompletion(model, demands);
  const sweepList = buildSweepList(model, report, sdcpnDefinition.patterns);
  return {
    model,
    report,
    record: {
      captures: model.activeCaptureIds.size,
      complete: report.complete,
      unsatisfied: report.failures.length,
      outsideSlice: report.outsideSlice.length,
      unmapped: model.unmapped.length,
      revision: report.revision,
      cue: buildCompletionCueSignal(model, report, sweepList).body,
    },
  };
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------

const yesNo = (value: boolean): string => (value ? "yes" : "no");

function renderSlot(slot: SlotState): string {
  switch (slot.state) {
    case "value":
      return `${JSON.stringify(slot.value)} — ${slot.precision}, ${slot.status}${
        slot.sourceRegime ? `, ${slot.sourceRegime}` : ""
      }${slot.evidenced ? "" : ", unevidenced"}${
        slot.rationale ? ` — _${slot.rationale}_` : ""
      }`;
    case "absence":
      return `absence: ${slot.absence}${slot.pointer ? ` → ${slot.pointer}` : ""} (${slot.status})`;
    case "conflict":
      return `conflict — ${slot.readings.length} readings`;
    case "divergence":
      return `divergence — prescribed ${JSON.stringify(
        slot.prescribed.assertion.assertion,
      )}; practiced ${JSON.stringify(slot.practiced.assertion.assertion)}`;
  }
}

function renderModel(
  model: ElicitedModel,
  report: CompletionReport,
  completion: HarnessCompletionRecord,
): string {
  const lines: string[] = [
    "# Condition 5 — the elicited model, folded from the capture store",
    "",
    "The harness's own deliverable: `foldElicitedModel` over the active captures, then",
    "`evaluateCompletion` against the sdcpn definition. Nothing here was written by the",
    "interviewer; every value is a capture the sweep extracted and the store admitted.",
    "",
    `- Plugin version: \`${model.pluginVersion}\``,
    `- Revision: \`${model.revision}\``,
    `- Active captures: ${completion.captures}`,
    `- Complete: **${yesNo(report.complete)}** — ${report.failures.length} unsatisfied, ${report.outsideSlice.length} node(s) outside every objective's slice, ${model.unmapped.length} unmapped capture(s)`,
    "",
    "## Nodes",
  ];
  const order = new Map(
    sdcpnDefinition.kinds.map((row, index) => [row.kind, index] as const),
  );
  const byKind = new Map<string, ElicitedModel["nodes"][number][]>();
  for (const node of model.nodes) {
    const list = byKind.get(node.kind) ?? [];
    list.push(node);
    byKind.set(node.kind, list);
  }
  const kinds = [...byKind.keys()].sort(
    (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99),
  );
  if (kinds.length === 0) lines.push("", "_No nodes._");
  for (const kind of kinds) {
    const nodes = byKind.get(kind)!;
    lines.push("", `### ${kind} (${nodes.length})`);
    for (const node of nodes) {
      lines.push("", `#### \`${node.id}\``);
      for (const [slot, state] of Object.entries(node.slots)) {
        lines.push(`- **${slot}** — ${renderSlot(state)}`);
      }
    }
  }
  lines.push("", "## Completion report", "");
  if (report.failures.length === 0) lines.push("_No unsatisfied demands._");
  for (const failure of report.failures) {
    lines.push(
      `- [${failure.diagnostic}] ${failure.message}${
        failure.nodeId
          ? ` (\`${failure.nodeId}\`${failure.slot ? ` — ${failure.slot}` : ""})`
          : ""
      }`,
    );
  }
  if (report.outsideSlice.length > 0) {
    lines.push("", "## Outside every objective's slice", "");
    for (const node of report.outsideSlice) {
      lines.push(`- \`${node.nodeId}\` — ${node.open.length} open`);
    }
  }
  if (model.unmapped.length > 0) {
    lines.push("", "## Unmapped captures", "");
    for (const unmapped of model.unmapped) {
      lines.push(`- \`${unmapped.captureId}\` — ${unmapped.reason}`);
    }
  }
  lines.push(
    "",
    "## The harness's cue at close",
    "",
    "```",
    completion.cue,
    "```",
  );
  return `${lines.join("\n")}\n`;
}

const formatUsage = (usage: Usage): string =>
  `${usage.input} in (+${usage.cacheWrite} cache write, +${usage.cacheRead} cache read) / ${usage.output} out across ${usage.calls} calls`;

const formatPurposeTiming = (
  timings: readonly TurnTimingRecord[],
  purpose: TurnTimingPurpose,
): string => {
  const matchingTimings = timings.filter(
    (timing) => timing.purpose === purpose,
  );
  if (matchingTimings.length === 0) return "—";
  const durationMs = matchingTimings.reduce(
    (total, timing) => total + timing.durationMs,
    0,
  );
  return `${durationMs} ms (${matchingTimings.length} call${matchingTimings.length === 1 ? "" : "s"})`;
};

function renderTranscript(
  run: HarnessRunRecord,
  openingMessage: string,
  sweepTally: { applied: number; refused: number; noRange: number },
): string {
  const last = run.turns.at(-1)?.completion;
  const header = [
    "# Baseline control — condition 5 (the harness in the loop)",
    "",
    `- Run started: ${run.startedAt}`,
    `- Interviewer: ${run.interviewerModel} as the shipped SDCPN elicitor in the Flue runtime — binding-flue's ask, settlement nudge, sweep, fold, and completion (instructions reconstructed in condition-5-system.md)`,
    `- Simulated expert: ${run.expertModel} + situation-pack.md`,
    `- Interviewer turns: ${run.turns.length} (impatience probe at ${IMPATIENCE_AT}, forced wrap at ${FORCE_WRAP_AT}, hard stop ${hardStopAt})`,
    `- Stop reason: ${run.stopReason}`,
    last === undefined
      ? "- Harness at close: no turn completed"
      : `- Harness at close: ${last.captures} active captures; complete ${yesNo(last.complete)}; ${last.unsatisfied} unsatisfied; ${last.unmapped} unmapped; sweeps applied ${sweepTally.applied}, refused ${sweepTally.refused}, no settled range ${sweepTally.noRange}`,
    `- Tokens: interviewer ${formatUsage(run.usage.interviewer)}; expert ${formatUsage(run.usage.expert)}`,
    "",
    "Harness facts are set off as `> harness —` lines: tool calls the interviewer made, signals the",
    "harness appended, and the read-time completion over the capture store after each turn. The",
    "expert never sees them.",
    "",
    "---",
    "**Opening message**:",
    "",
    openingMessage,
  ];
  const body = run.turns.map((turn) => {
    const parts: string[] = [
      "---",
      "",
      `**Interviewer — turn ${turn.turn}** | interview ${formatPurposeTiming(turn.timings, "interview")} | sweep ${formatPurposeTiming(turn.timings, "sweep")} | repair ${formatPurposeTiming(turn.timings, "repair")}`,
      "",
    ];
    if (turn.text.length === 0 && turn.asks.length === 0) {
      parts.push("_(no visible text this turn)_");
    }
    parts.push(...turn.text.flatMap((text) => [text, ""]));
    for (const signal of turn.signals) {
      parts.push(
        `> harness — signal \`${signal.tagName}\`: ${signal.excerpt.replaceAll("\n", " ")}`,
      );
    }
    for (const sweep of turn.sweeps) {
      const completion = sweep.completion as
        | { complete?: boolean; unsatisfied?: number }
        | undefined;
      parts.push(
        `> harness — sweep ${sweep.status}${
          sweep.appliedCaptureIds
            ? `; applied ${sweep.appliedCaptureIds.length}`
            : ""
        }${sweep.skippedDedupKeys?.length ? `; skipped ${sweep.skippedDedupKeys.length}` : ""}${
          sweep.advisories?.length
            ? `; advisories ${sweep.advisories.length}`
            : ""
        }${sweep.refusal ? `; refusal ${JSON.stringify(sweep.refusal)}` : ""}${
          completion
            ? `; completion complete=${yesNo(completion.complete === true)} unsatisfied=${completion.unsatisfied ?? "?"}`
            : ""
        }`,
      );
    }
    for (const error of turn.toolErrors) {
      parts.push(
        `> harness — tool error \`${error.toolName}\`: ${error.errorText}`,
      );
    }
    for (const ask of turn.asks.filter((candidate) => candidate.rejected)) {
      parts.push(
        `> harness — ask rejected: ${ask.rejected} (question: ${excerpt(ask.question, 120)})`,
      );
    }
    if (turn.settlement)
      parts.push(`> harness — submission ${turn.settlement}`);
    parts.push(
      `> harness — completion after turn ${turn.turn}: ${turn.completion.captures} captures; complete ${yesNo(turn.completion.complete)}; ${turn.completion.unsatisfied} unsatisfied; ${turn.completion.unmapped} unmapped`,
    );
    if (turn.pendingQuestion !== undefined) {
      parts.push("", "**Ask**:", "", turn.pendingQuestion);
    }
    if (turn.expert) {
      parts.push("", "---", "");
      if (
        turn.expert.stimulus &&
        turn.expert.content === turn.expert.stimulus
      ) {
        parts.push(
          "**Injected experiment stimulus (not expert evidence)**:",
          "",
          turn.expert.stimulus,
        );
      } else {
        parts.push(
          "**Expert (Marta)**:",
          "",
          turn.expert.content,
          ...(turn.expert.stimulus
            ? [
                "",
                "**Injected experiment stimulus (not expert evidence)**:",
                "",
                turn.expert.stimulus,
              ]
            : []),
          ...(turn.expert.truncated
            ? ["", "_(expert reply truncated at its token budget)_"]
            : []),
        );
      }
    }
    parts.push("");
    return parts.join("\n");
  });
  return `${[...header, "", ...body].join("\n")}`;
}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

const startedAt = new Date().toISOString();
const situationPack = await readFile(`${caseDir}situation-pack.md`, "utf8");
const openingRaw = await readFile(`${caseDir}opening-message.md`, "utf8");
const openingSeparator = openingRaw.indexOf("\n---\n");
const openingMessage = (
  openingSeparator === -1 ? openingRaw : openingRaw.slice(openingSeparator + 5)
).trim();

// The app modules are imported after the environment is set: the elicitor
// reads its model id and the target-document directory at module load.
const [
  { SdcpnElicitor },
  { default: app },
  { SDCPN_AGENT_ROUTE },
  { targetDocumentPath },
] = await Promise.all([
  import("../../../../../../../apps/brunch-agent/src/agents/sdcpn-elicitor.ts"),
  import("../../../../../../../apps/brunch-agent/src/app.ts"),
  import("../../../../../../../apps/brunch-agent/src/routes.ts"),
  import("../../../../../../../apps/brunch-agent/src/target-document-path.ts"),
]);

const provider: Provider = interviewerProviderModule
  ? ((await import(interviewerProviderModule)).default as Provider)
  : (
      await import("@earendil-works/pi-ai/providers/anthropic")
    ).anthropicProvider();

const interviewerUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  calls: 0,
};
const turnTimingRecorder = createTurnTimingRecorder();
const stopObserving = observe((event) => {
  turnTimingRecorder.observe(event);
  if (event.type !== "turn") return;
  interviewerUsage.calls += 1;
  const usage = event.response.usage;
  if (!usage) return;
  interviewerUsage.input += usage.input;
  interviewerUsage.output += usage.output;
  interviewerUsage.cacheRead += usage.cacheRead;
  interviewerUsage.cacheWrite += usage.cacheWrite;
});

const flue = await start({ agents: [SdcpnElicitor], providers: [provider] });

const conversationId = `baseline-condition-5-${startedAt.replaceAll(/[:.]/gu, "-")}`;
const targetDocumentId = conversationId;
const fetchApp: typeof fetch = (input, init) =>
  Promise.resolve(
    app.fetch(input instanceof Request ? input : new Request(input, init)),
  );
const client = createFlueClient({
  url: `http://brunch.local/agents/${SDCPN_AGENT_ROUTE}/${conversationId}`,
  fetch: fetchApp,
});
const store = createLocalCaptureStore(targetDocumentPath(targetDocumentId));

const turns: HarnessTurnRecord[] = [];
const expertView: ExpertMessage[] = [];
let stopReason = "hard-stop";
let turnsWithoutAsk = 0;
let wrapSent = false;
let consumedMessages = 0;

async function dispatch(body: string, initial = false): Promise<void> {
  const admission = await client.send({
    message: { kind: "user", body },
    ...(initial ? { initialData: { targetDocumentId } } : {}),
  });
  await client.wait(admission);
}

async function writeArtifacts(): Promise<void> {
  const history = await client.history();
  const storeSnapshot = await store.read();
  const { model, report, record } = readCompletion(storeSnapshot);
  const run: HarnessRunRecord = {
    startedAt,
    condition: CONDITION,
    interviewerModel,
    expertModel: EXPERT_MODEL,
    conversationId,
    stopReason,
    turns,
    timings: turnTimingRecorder.all(),
    usage: { interviewer: interviewerUsage, expert: expertUsage },
    history,
    store: storeSnapshot,
  };
  const sweepTally = { applied: 0, refused: 0, noRange: 0 };
  for (const sweep of turns.flatMap((turn) => turn.sweeps)) {
    if (sweep.status === "applied") sweepTally.applied += 1;
    else if (sweep.status === "refused") sweepTally.refused += 1;
    else if (sweep.status === "no-settled-range") sweepTally.noRange += 1;
  }
  await mkdir(transcriptDir, { recursive: true });
  const stem = join(transcriptDir, `condition-${CONDITION}`);
  await writeFile(`${stem}.raw.json`, `${JSON.stringify(run, null, 2)}\n`);
  await writeFile(
    `${stem}.md`,
    renderTranscript(run, openingMessage, sweepTally),
  );
  await writeFile(`${stem}-model.md`, renderModel(model, report, record));
  await writeFile(
    `${stem}-captures.json`,
    `${JSON.stringify(storeSnapshot, null, 2)}\n`,
  );
  await writeFile(
    `${stem}-system.md`,
    [
      "# Condition 5 — the interviewer's instructions",
      "",
      "Reconstructed with the same functions the binding composes them from",
      "(`askProtocolInstructionFragments`, `settlementProtocolInstructionFragments`,",
      "`renderInstructions(repertoire, sdcpnDefinition)`), so this is the text the",
      "elicitor rendered, minus whatever Flue prepends about its own tools.",
      "",
      "---",
      "",
      [
        ...askProtocolInstructionFragments(sdcpn.targetFormalism),
        ...settlementProtocolInstructionFragments(),
        renderInstructions(repertoire, sdcpnDefinition),
      ].join("\n\n"),
      "",
    ].join("\n"),
  );
}

try {
  console.error(
    `condition ${CONDITION}: interviewer ${interviewerModel}, expert ${EXPERT_MODEL}`,
  );
  let outgoing = openingMessage;
  let initial = true;
  while (turns.length < hardStopAt) {
    const turnNumber = turns.length + 1;
    console.error(`turn ${turnNumber} (interviewer)`);
    turnTimingRecorder.startInterviewerTurn(turnNumber);
    await dispatch(outgoing, initial);
    initial = false;

    const history = await client.history();
    const fresh = history.messages.slice(consumedMessages);
    consumedMessages = history.messages.length;
    const observed = readTurn(fresh);
    const pendingId = pendingAskAffordanceId(
      projectFlueHistoryForSweep(history),
    );
    const pendingQuestion =
      pendingId === undefined
        ? undefined
        : observed.asks.find(
            (ask) =>
              !ask.rejected && `affordance_${ask.toolCallId}` === pendingId,
          )?.question;
    const { record: completion } = readCompletion(await store.read());
    const turnTimings = turnTimingRecorder.forInterviewerTurn(turnNumber);
    const turn: HarnessTurnRecord = {
      turn: turnNumber,
      ...observed,
      ...(pendingQuestion === undefined ? {} : { pendingQuestion }),
      timings: turnTimings,
      completion,
    };
    turns.push(turn);
    await appendFile(
      timingsPath,
      `${turnTimings.map((timing) => JSON.stringify(timing)).join("\n")}\n`,
    );
    console.error(
      `  harness: ${completion.captures} captures, complete ${yesNo(completion.complete)}, ${completion.unsatisfied} unsatisfied; sweeps ${observed.sweeps.map((sweep) => sweep.status).join(",") || "none"}; ask ${pendingQuestion === undefined ? "none" : "pending"}`,
    );

    if (observed.settlement) {
      stopReason = `submission-${observed.settlement}`;
      break;
    }
    if (pendingQuestion === undefined) {
      turnsWithoutAsk += 1;
      if (completion.complete) {
        stopReason = "closed-complete";
        break;
      }
      if (wrapSent) {
        stopReason = "closed-incomplete";
        break;
      }
      if (turnsWithoutAsk >= STALL_AFTER_TURNS_WITHOUT_ASK) {
        stopReason = "stalled";
        break;
      }
    } else {
      turnsWithoutAsk = 0;
    }
    if (turns.length >= hardStopAt) break;

    // What the expert sees: the interviewer's visible text and its question.
    const visible = [
      ...observed.text,
      ...(pendingQuestion === undefined ? [] : [pendingQuestion]),
    ]
      .join("\n\n")
      .trim();
    expertView.push({
      role: "user",
      content:
        visible.length > 0
          ? visible
          : "[The interviewer said nothing this turn.]",
    });

    if (turnNumber >= FORCE_WRAP_AT) {
      wrapSent = true;
      outgoing = FORCED_WRAP_MESSAGE;
      expertView.push({ role: "assistant", content: FORCED_WRAP_MESSAGE });
      turns[turns.length - 1] = {
        ...turn,
        expert: { content: FORCED_WRAP_MESSAGE, stimulus: FORCED_WRAP_MESSAGE },
      };
      continue;
    }

    console.error(`turn ${turnNumber} (expert)`);
    const reply = await callExpert(situationPack, expertView);
    const stimulus = turnNumber === IMPATIENCE_AT ? IMPATIENCE_LINE : undefined;
    outgoing = stimulus ? `${reply.text}\n\n${stimulus}` : reply.text;
    expertView.push({ role: "assistant", content: outgoing });
    turns[turns.length - 1] = {
      ...turn,
      expert: {
        content: reply.text,
        ...(stimulus ? { stimulus } : {}),
        ...(reply.truncated ? { truncated: true } : {}),
      },
    };
  }
  await writeArtifacts();
  const last = turns.at(-1)?.completion;
  console.error(
    `done: ${stopReason} after ${turns.length} interviewer turns; ${last?.captures ?? 0} captures, complete ${yesNo(last?.complete === true)}; interviewer ${formatUsage(interviewerUsage)}; expert ${formatUsage(expertUsage)}`,
  );
} catch (error) {
  stopReason = `runner-error: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
  await writeArtifacts().catch((writeError: unknown) =>
    console.error(writeError),
  );
  process.exitCode = 1;
} finally {
  stopObserving();
  await flue.stop();
  await rm(targetDocumentDirectory, { recursive: true, force: true });
}
