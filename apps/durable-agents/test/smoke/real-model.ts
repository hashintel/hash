/**
 * A small real-model smoke run of the durable agents server: `yarn start`
 * with `DURABLE_AGENTS_MODEL` from `SMOKE_MODEL` (default
 * `anthropic/claude-sonnet-4-5`; `openrouter/anthropic/claude-sonnet-4.5` is
 * the same model through OpenRouter), driven over HTTP by
 * AI SDK's stock `DefaultChatTransport` and a scripted browser.
 *
 * Usage, from `apps/durable-agents` with the compose Postgres up and
 * `ANTHROPIC_API_KEY` set: `yarn tsx test/smoke/real-model.ts`. It spends real
 * model requests, at most `budget` across every run that shares the ledger.
 *
 * - Turn 1 builds a place and a transition; the browser claims, starts and
 *   answers each call with a plausible result.
 * - Turn 2 asks a question the net answers; the browser answers net reads
 *   from what turn 1 built.
 * - Turn 3, when at least three requests remain, asks for a Ledger commit.
 *
 * Requests are counted by `count-provider-requests.ts`, preloaded into the
 * server process: one ledger line per HTTP request to the provider API (Anthropic, OpenAI or OpenRouter),
 * refusing any beyond the budget. The driver also aborts a turn the moment
 * the budget is spent. Afterwards it stops the server, reads the stored
 * conversation and drops the conversation's schema.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  createRegistry,
  Harness,
  ROOT_CONVERSATION_ID,
} from "@earendil-works/pi-durable";
import {
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Pool } from "pg";

import {
  type BrowserCallClaim,
  type BrowserCallResultBody,
  type BrowserContext,
  canonicalContent,
} from "@hashintel/brunch-agent";

import { createPetrinautAgent } from "../../src/agent/petrinaut-agent";
import { BrowserCallsDoc } from "../../src/browser-call/browser-call";
import { LedgerDoc } from "../../src/ledger";
import { conversationSchema } from "../../src/server/conversation-storage";
import { browserCallsPrefix } from "../../src/server/start-durable-agents-server";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../src/storage/postgres/postgres-storage";

const model = process.env.SMOKE_MODEL ?? "anthropic/claude-sonnet-4-5";
/**
 * `SMOKE_DRY_RUN=1` checks the wiring without spending: the preload refuses
 * every request (budget 0, its own ledger) and only turn 1 runs, briefly.
 */
const dryRun = process.env.SMOKE_DRY_RUN === "1";
const budget = dryRun ? 0 : 10;
const turnTimeoutMs = dryRun ? 20_000 : 4 * 60_000;
const ledgerPath = join(
  tmpdir(),
  dryRun
    ? `durable-agents-smoke-dry-${randomUUID()}.jsonl`
    : "durable-agents-smoke-requests.jsonl",
);
const preload = fileURLToPath(
  new URL("count-provider-requests.ts", import.meta.url),
);
const appDirectory = fileURLToPath(new URL("../..", import.meta.url));
const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();

const print = (text: string) => process.stdout.write(`${text}\n`);
const show = (heading: string, value: unknown) =>
  print(`\n${heading}\n${JSON.stringify(value, null, 2)}`);

type LedgerLine = {
  event: "request" | "response" | "refused";
  n?: number;
  status?: number;
  error?: string;
};
const ledgerLines = (): LedgerLine[] =>
  existsSync(ledgerPath)
    ? readFileSync(ledgerPath, "utf8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as LedgerLine)
    : [];
const requestsUsed = () =>
  ledgerLines().filter(({ event }) => event === "request").length;

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address !== null
          ? resolve(address.port)
          : reject(new Error("No port.")),
      );
    });
  });

/** `yarn start` in its own process group, so a signal reaches yarn, tsx and the server. */
const startServer = async () => {
  const port = await freePort();
  const child = spawn("yarn", ["start"], {
    cwd: appDirectory,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      DURABLE_AGENTS_MODEL: model,
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS ?? ""} --import ${preload}`.trim(),
      SMOKE_REQUEST_LEDGER: ledgerPath,
      SMOKE_REQUEST_BUDGET: String(budget),
    },
  });
  const exited = new Promise<{ code: number | null; signal: string | null }>(
    (resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
    },
  );
  const listening = new Promise<void>((resolve, reject) => {
    createInterface({ input: child.stdout }).on("line", (line) => {
      print(`  [server] ${line}`);
      if (line.startsWith("Durable agents server on")) resolve();
    });
    createInterface({ input: child.stderr }).on("line", (line) =>
      print(`  [server:err] ${line}`),
    );
    void exited.then((end) =>
      reject(
        new Error(`Server exited before listening: ${JSON.stringify(end)}`),
      ),
    );
  });
  await listening;
  return {
    origin: `http://127.0.0.1:${port}`,
    signal: (signal: NodeJS.Signals) => {
      if (child.pid !== undefined && child.exitCode === null)
        process.kill(-child.pid, signal);
    },
    exited,
  };
};

/** A browser that answers every call from a small net it keeps. */
const fakeBrowser = () => {
  const places: { id: string; name: string }[] = [];
  const transitions: { id: string; name: string }[] = [];
  const answer = (toolName: string, input: unknown): unknown => {
    const fields = (input ?? {}) as { id?: unknown; name?: unknown };
    const element = {
      id: typeof fields.id === "string" ? fields.id : randomUUID(),
      name: typeof fields.name === "string" ? fields.name : "",
    };
    switch (toolName) {
      case "addPlace":
        places.push(element);
        return { ok: true, id: element.id };
      case "addTransition":
        transitions.push(element);
        return { ok: true, id: element.id };
      case "readNetOutline":
      case "readNetStructure":
        return {
          title: "Untitled",
          definition: {
            places: places.map((place) => ({
              ...place,
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
            })),
            transitions: transitions.map((transition) => ({
              ...transition,
              inputArcs: [],
              outputArcs: [],
              lambdaType: "predicate",
            })),
            types: [],
            parameters: [],
            differentialEquations: [],
          },
          extensions: {},
        };
      default:
        return { ok: true };
    }
  };
  return { answer };
};

type BrowserOutcome = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  claim: number;
  start: number;
  result: number;
  output: unknown;
};

const reduce = async (chunks: readonly UIMessageChunk[]) => {
  let message: UIMessage | undefined;
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  for await (const next of readUIMessageStream({ stream })) message = next;
  return message;
};

const drive = async () => {
  const chatId = `smoke-${randomUUID()}`;
  const binding: BrowserContext["binding"] = {
    conversationId: chatId,
    documentId: `net-${randomUUID()}`,
  };
  const claimBinding = canonicalContent(binding);
  const claimant = `tab-${randomUUID()}`;
  const browser = fakeBrowser();
  const startingUsed = requestsUsed();
  print(
    `Ledger ${ledgerPath}: ${startingUsed} of ${budget} requests already used.`,
  );
  print(`Conversation ${chatId}, schema ${conversationSchema(chatId)}`);
  if (startingUsed >= budget && !dryRun) throw new Error("No budget left.");

  const server = await startServer();
  const transport = new DefaultChatTransport<UIMessage>({
    api: `${server.origin}/chat`,
    body: { binding },
  });
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${server.origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json().catch(() => null)) as unknown,
    };
  };
  const callPath = (callId: string, step = "") =>
    `${browserCallsPrefix}/${encodeURIComponent(chatId)}/browser-calls/${encodeURIComponent(callId)}${step}`;

  /** Claim (retrying a 404 while the issue commits), start and answer one call. */
  const playCall = async (toolCallId: string): Promise<BrowserOutcome> => {
    let claimed = await post(callPath(toolCallId), {
      claimant,
      binding: claimBinding,
    });
    for (let tries = 0; claimed.status === 404 && tries < 400; tries++) {
      // Each try waits for the one before.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 25));
      // eslint-disable-next-line no-await-in-loop
      claimed = await post(callPath(toolCallId), {
        claimant,
        binding: claimBinding,
      });
    }
    if (claimed.status !== 200)
      return {
        toolCallId,
        toolName: "?",
        input: null,
        claim: claimed.status,
        start: 0,
        result: 0,
        output: claimed.body,
      };
    const claim = claimed.body as BrowserCallClaim;
    const proof = { capability: claim.capability, binding: claim.binding };
    const started = await post(callPath(toolCallId, "/start"), proof);
    const output = browser.answer(claim.toolName, claim.input);
    const body: BrowserCallResultBody = {
      ...proof,
      toolName: claim.toolName,
      canonicalInput: claim.input,
      output,
    };
    const resulted = await post(callPath(toolCallId, "/result"), body);
    return {
      toolCallId,
      toolName: claim.toolName,
      input: claim.input,
      claim: claimed.status,
      start: started.status,
      result: resulted.status,
      output,
    };
  };

  const turns: unknown[] = [];
  const runTurn = async (label: string, text: string) => {
    const before = requestsUsed();
    print(`\n== ${label}: "${text}" (${before} of ${budget} requests used)`);
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId,
      messageId: undefined,
      messages: [
        {
          id: `user-${randomUUID()}`,
          role: "user",
          parts: [{ type: "text", text }],
        },
      ],
      abortSignal: undefined,
    });
    const chunks: UIMessageChunk[] = [];
    const calls: Promise<BrowserOutcome>[] = [];
    let aborted: string | undefined;
    const abort = (why: string) => {
      if (aborted !== undefined) return;
      aborted = why;
      print(`  aborting the turn: ${why}`);
      void post(`/chat/${encodeURIComponent(chatId)}/abort`, {});
    };
    const watchdog = setInterval(() => {
      if (requestsUsed() >= budget && !dryRun) abort("budget spent");
    }, 250);
    const deadline = setTimeout(() => abort("turn timeout"), turnTimeoutMs);
    let ending = "done";
    try {
      for await (const chunk of stream) {
        chunks.push(chunk);
        if (chunk.type === "tool-input-available")
          print(
            `  tool call ${chunk.toolName}${chunk.providerExecuted === true ? " (server)" : " (browser)"}`,
          );
        if (
          chunk.type === "tool-input-available" &&
          chunk.providerExecuted !== true
        )
          calls.push(playCall(chunk.toolCallId));
        if (chunk.type === "error") print(`  error chunk: ${chunk.errorText}`);
      }
    } catch (error) {
      ending = `stream error: ${String(error)}`;
    } finally {
      clearInterval(watchdog);
      clearTimeout(deadline);
    }
    const browserCalls = await Promise.all(calls);
    const message = await reduce(chunks);
    const parts = (message?.parts ?? []).filter(
      ({ type }) => type !== "step-start",
    );
    const types = chunks.map(({ type }) => type);
    const outcome = {
      label,
      chunkTypes: [...new Set(types)],
      chunkCounts: Object.fromEntries(
        [...new Set(types)].map((type) => [
          type,
          types.filter((each) => each === type).length,
        ]),
      ),
      steps: types.filter((type) => type === "start-step").length,
      finished: types.at(-1) === "finish",
      ending,
      aborted,
      browserCalls: browserCalls.map(({ output: _output, ...call }) => call),
      renderedParts: parts.map((part) =>
        part.type === "text"
          ? { type: "text", text: part.text }
          : "toolCallId" in part
            ? {
                type: part.type,
                state: part.state,
                toolCallId: part.toolCallId,
              }
            : { type: part.type },
      ),
      requestsThisTurn: requestsUsed() - before,
    };
    show(`${label} outcome`, outcome);
    turns.push(outcome);
    return outcome;
  };

  try {
    const first = await runTurn(
      "Turn 1",
      "Create a place called Queue and a transition called Serve.",
    );
    // A turn that ends in an error stops the run: later turns would spend requests on the same failure.
    const second =
      first.finished && requestsUsed() < budget && !dryRun
        ? await runTurn(
            "Turn 2",
            "Read the current net and tell me which places and transitions it has.",
          )
        : undefined;
    if (second?.finished === true && budget - requestsUsed() >= 3)
      await runTurn(
        "Turn 3",
        "Record in your Ledger that the system I'm describing is a single-server queue: customers wait in Queue and are handled by Serve.",
      );
    else
      print(
        "\nTurn 3 skipped: an earlier turn failed or fewer than three requests remain.",
      );
  } finally {
    server.signal("SIGTERM");
    const stopped = await Promise.race([
      server.exited,
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 15_000),
      ),
    ]);
    if (stopped === "timeout") {
      server.signal("SIGKILL");
      await server.exited;
    }
    show("Server exit", stopped);
  }

  const stored = await readStored(chatId);
  show("Stored conversation", stored);
  const admin = new Pool({ ...poolConfig, max: 1 });
  await admin.query(
    `DROP SCHEMA IF EXISTS "${conversationSchema(chatId)}" CASCADE`,
  );
  await admin.end();
  print(`\nDropped schema ${conversationSchema(chatId)}.`);
  show(
    "Provider requests (ledger)",
    ledgerLines().map(({ error, ...line }) =>
      error === undefined ? line : { ...line, error },
    ),
  );
  print(
    `\nRequests this run: ${requestsUsed() - startingUsed}; total against the budget: ${requestsUsed()} of ${budget}.`,
  );
};

/** The conversation as stored, by a read-only Harness after the server is gone. */
const readStored = async (chatId: string) => {
  const registry = createRegistry();
  for (const extension of createPetrinautAgent().extensions)
    registry.install(extension);
  const harness = await Harness.open(
    await openPostgresStorage({
      pool: poolConfig,
      schema: conversationSchema(chatId),
      readOnly: true,
    }),
    { models: builtinModels(), registry, readOnly: true },
    context,
  );
  try {
    const root = (await harness.conversation(ROOT_CONVERSATION_ID, context))!;
    const entries = (
      await root.entries({ order: "ascending" }, 200, undefined, context)
    ).items.filter(({ kind }) => kind !== "pi.system");
    const calls =
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {};
    const ledger = await harness.snapshot(LedgerDoc, root.id, context);
    return {
      transcript: entries.map((entry) => {
        const message = entry.model?.[0];
        if (message?.role === "assistant")
          return {
            kind: entry.kind,
            stopReason: message.stopReason,
            errorMessage: message.errorMessage,
            usage: {
              input: message.usage.input,
              output: message.usage.output,
              cacheRead: message.usage.cacheRead,
              cacheWrite: message.usage.cacheWrite,
            },
            content: message.content.map((part) =>
              part.type === "text"
                ? { text: part.text }
                : part.type === "toolCall"
                  ? { toolCall: part.name, arguments: part.arguments }
                  : { type: part.type },
            ),
          };
        if (message?.role === "toolResult")
          return {
            kind: entry.kind,
            toolName: message.toolName,
            isError: message.isError,
            text: message.content
              .flatMap((part) => (part.type === "text" ? [part.text] : []))
              .join("")
              .slice(0, 600),
          };
        return { kind: entry.kind };
      }),
      browserCalls: Object.values(calls).map(
        ({ toolCallId, toolName, status }) => ({
          toolCallId,
          toolName,
          status,
        }),
      ),
      ledger,
    };
  } finally {
    await harness.close(context);
  }
};

await drive();
