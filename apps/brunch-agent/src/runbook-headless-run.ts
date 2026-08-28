/**
 * Headless Mission 3 drive: createFlueClient → send → wait → history()
 * against the production ChatAgent. A second model plays the expert from the
 * Vestera situation pack. The driver never activates skills or writes the
 * capture store.
 *
 *   yarn workspace @apps/brunch-agent runbook:headless
 *
 *   ANTHROPIC_API_KEY              required unless BRUNCH_RUNBOOK_ANTHROPIC_MODULE is set
 *   BRUNCH_CHAT_MODEL              interviewer; this script defaults it to claude-sonnet-4-5
 *   BRUNCH_RUNBOOK_EXPERT_MODEL    expert; defaults to claude-sonnet-4-5
 *   BRUNCH_RUNBOOK_HARD_STOP       interviewer turns before construct; default 8
 *   BRUNCH_RUNBOOK_OUTPUT_DIR      artifact directory
 *   BRUNCH_RUNBOOK_ANTHROPIC_MODULE  test-only expert client stand-in
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { observe } from "@flue/runtime";
import { sqlite, start } from "@flue/runtime/node";
import { createFlueClient } from "@flue/sdk";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import {
  interviewerToolNamesFrom,
  recoverPnJson,
  recoverRunbookIr,
  skillResourcePathsFrom,
} from "./runbook-artifacts.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

process.env.BRUNCH_CHAT_MODEL ??= "claude-sonnet-4-5";

const { ChatAgent, CHAT_MODEL_ID } = await import("./agents/chat-agent.ts");
const { default: app } = await import("./app.ts");
const { agentOwnershipHeaders, flueConversationIdFrom } =
  await import("./conversation-identity.ts");
const { formatFlueTranscript } = await import("./flue-transcript.ts");
const { CHAT_AGENT_ROUTE } = await import("./routes.ts");

const EXPERT_MODEL =
  process.env.BRUNCH_RUNBOOK_EXPERT_MODEL ?? "claude-sonnet-4-5";
const HARD_STOP = Number(process.env.BRUNCH_RUNBOOK_HARD_STOP ?? "8");
const LATENCY_STOP_MS = Number(
  process.env.BRUNCH_RUNBOOK_LATENCY_STOP_MS ?? "180000",
);
const expertClientModule = process.env.BRUNCH_RUNBOOK_ANTHROPIC_MODULE;
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey && !expertClientModule) {
  process.stderr.write("ANTHROPIC_API_KEY is not set\n");
  process.exit(1);
}

const caseDirectory = fileURLToPath(
  new URL(
    "../../../libs/@hashintel/brunch-agent/evaluations/cases/process-model-elicitation/baseline/",
    import.meta.url,
  ),
);
const defaultOutputDirectory = fileURLToPath(
  new URL(
    "../../../libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/runbook-headless/",
    import.meta.url,
  ),
);
const outputDirectory =
  process.env.BRUNCH_RUNBOOK_OUTPUT_DIR ?? defaultOutputDirectory;

const situationPack = await readFile(
  join(caseDirectory, "situation-pack.md"),
  "utf8",
);
const openingRaw = await readFile(
  join(caseDirectory, "opening-message.md"),
  "utf8",
);
const openingSeparator = openingRaw.indexOf("\n---\n");
const openingMessage = (
  openingSeparator === -1 ? openingRaw : openingRaw.slice(openingSeparator + 5)
).trim();

const constructMessage = [
  "Please construct the Petri-net JSON from the current runbook IR.",
  "Read the construction and check resources.",
  "Emit the filled IR in a runbook-ir fence and the net in a pn-json fence.",
  "Name every inference, approximation, default, omission, and unrepresentable fact.",
].join(" ");

interface ExpertMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

interface ExpertResponse {
  readonly content: readonly {
    readonly type: string;
    readonly text?: string;
  }[];
}

interface ExpertClient {
  messages: {
    create(request: {
      model: string;
      max_tokens: number;
      thinking: { type: "disabled" };
      system: string;
      messages: readonly ExpertMessage[];
    }): Promise<ExpertResponse>;
  };
}

const defaultExportFrom = async (specifier: string): Promise<unknown> => {
  const loaded: unknown = await import(specifier);
  if (typeof loaded !== "object" || loaded === null || !("default" in loaded)) {
    throw new Error(`${specifier} has no default export`);
  }
  return loaded.default;
};

const expertClient: ExpertClient = expertClientModule
  ? ((await defaultExportFrom(expertClientModule)) as ExpertClient)
  : new ((await defaultExportFrom("@anthropic-ai/sdk")) as new (options: {
      apiKey: string | undefined;
      maxRetries: number;
      timeout: number;
    }) => ExpertClient)({
      apiKey,
      maxRetries: 5,
      timeout: 30 * 60 * 1000,
    });

const expertMessages: ExpertMessage[] = [];

const askExpert = async (interviewerText: string): Promise<string> => {
  expertMessages.push({ role: "user", content: interviewerText });
  const response = await expertClient.messages.create({
    model: EXPERT_MODEL,
    max_tokens: 1500,
    thinking: { type: "disabled" },
    system: situationPack,
    messages: expertMessages,
  });
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  expertMessages.push({ role: "assistant", content: text });
  return text;
};

const latestAssistantText = (snapshot: FlueConversationSnapshot): string => {
  const assistantMessages = snapshot.messages.filter(
    (message) => message.purpose === "assistant",
  );
  for (const message of assistantMessages.toReversed()) {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text.length > 0) return text;
  }
  return "";
};

const turnDurationsMs: number[] = [];
const stopObserving = observe((event) => {
  if (event.type !== "turn") return;
  if (typeof event.durationMs === "number") {
    turnDurationsMs.push(event.durationMs);
  }
});

const { anthropicProvider } =
  await import("@earendil-works/pi-ai/providers/anthropic");

const principalKey = "principal-runbook-headless";
const conversationId = `runbook-headless-${new Date().toISOString().replaceAll(/[:.]/gu, "-")}`;
const identity = { principalKey, conversationId };
const instanceId = flueConversationIdFrom(identity);
const dbFile = join(tmpdir(), `${conversationId}.db`);

await mkdir(outputDirectory, { recursive: true });

const flue = await start({
  agents: [ChatAgent],
  providers: [anthropicProvider()],
  db: sqlite(dbFile),
});

const appTransport: typeof fetch = async (input, init) =>
  app.fetch(input instanceof Request ? input : new Request(input, init));

const client = createFlueClient({
  url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
  fetch: appTransport,
  headers: agentOwnershipHeaders(identity),
});

const dispatch = async (body: string): Promise<void> => {
  const admission = await client.send({ message: { kind: "user", body } });
  await client.wait(admission);
};

let stopReason = "hard-stop";
try {
  await dispatch(openingMessage);
  for (let turn = 1; turn <= HARD_STOP; turn++) {
    const latestDuration = turnDurationsMs.at(-1);
    if (latestDuration !== undefined && latestDuration > LATENCY_STOP_MS) {
      stopReason = "latency-stop";
      break;
    }
    const snapshot = await client.history();
    if (recoverRunbookIr(snapshot) !== undefined && turn >= 3) {
      stopReason = "ir-ready";
      break;
    }
    const interviewerText = latestAssistantText(snapshot);
    if (interviewerText.length === 0) {
      stopReason = "empty-interviewer";
      break;
    }
    const expertReply = await askExpert(interviewerText);
    await dispatch(expertReply);
  }

  await dispatch(constructMessage);
  const snapshot = await client.history();
  const ir = recoverRunbookIr(snapshot);
  const pn = recoverPnJson(snapshot);
  const parsed =
    pn === undefined
      ? { ok: false as const, error: "no pn-json fence" }
      : parseSDCPNFile(pn);
  const toolNames = interviewerToolNamesFrom(snapshot);
  const resourcePaths = skillResourcePathsFrom(snapshot);
  const record = {
    startedAt: conversationId,
    interviewerModel: CHAT_MODEL_ID,
    expertModel: EXPERT_MODEL,
    stopReason,
    turnDurationsMs,
    toolNames,
    resourcePaths,
    ir,
    pn,
    parse: parsed.ok
      ? { ok: true, hadMissingPositions: parsed.hadMissingPositions }
      : { ok: false, error: parsed.error },
    wroteCaptureStore: false,
    transcript: formatFlueTranscript(snapshot),
  };
  await writeFile(
    `${outputDirectory}/${conversationId}.json`,
    `${JSON.stringify(record, null, 2)}\n`,
  );
  await writeFile(
    `${outputDirectory}/${conversationId}.md`,
    `# Runbook headless ${conversationId}\n\n${record.transcript}\n`,
  );
  if (ir !== undefined) {
    await writeFile(`${outputDirectory}/${conversationId}.ir.md`, `${ir}\n`);
  }
  process.stdout.write(
    `RUNBOOK_HEADLESS_RESULT ${JSON.stringify({
      stopReason,
      hasIr: ir !== undefined,
      parseOk: parsed.ok,
      toolNames,
      resourcePaths,
      maxTurnMs: Math.max(0, ...turnDurationsMs),
    })}\n`,
  );
} finally {
  stopObserving();
  await flue.stop();
}
