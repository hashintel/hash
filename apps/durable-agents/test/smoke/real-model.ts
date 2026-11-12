/**
 * A small real-model smoke run of the durable agents server: `yarn start`
 * with `DURABLE_AGENTS_MODEL` from `SMOKE_MODEL` (default
 * `openai/gpt-6.1-sol`, production's model), driven over HTTP by AI SDK's
 * stock `DefaultChatTransport` and a scripted browser.
 *
 * Usage, from `apps/durable-agents` with the compose Postgres up and the
 * provider's key set (`OPENAI_API_KEY`): `yarn tsx test/smoke/real-model.ts`.
 * It spends real model requests, at most `budget` across every run that
 * shares the ledger. Run `SMOKE_DRY_RUN=1` first: it checks the wiring at
 * zero spend.
 *
 * - Turn 1 asks to build a place, a transition and an arc now, before any
 *   read: the server should refuse the first change (no view of the net) and
 *   the model read, then build. When it changes nothing, one firmer turn
 *   retries the request.
 * - Turn 2 asks for one more change and prompts no read: it must be admitted
 *   on the view turn 1 left in context.
 * - Then the scripted browser edits its net by hand (a new revision) and
 *   reports it on the hand-edits route; turn 3 asks for a change, which the
 *   model's now-stale view must not carry.
 * - Then, budget allowing, the driver stops the server and compacts the
 *   stored conversation itself, through a Harness of its own whose
 *   `keepRecentTokens` is 1 (so the kept tail holds no net view), restarts
 *   the server, and turn 4 asks for a change with no read: the `net_view`
 *   section should restore the view the summary dropped.
 * - Then, budget allowing, turn 5 asks to save the net (`app_save_net`, its
 *   description naming the bound document after the restart) and turn 6 asks
 *   a question only a HASH graph read answers.
 * - Every turn shows whether it ended on a `ledger_commit` with `endTurn`
 *   (fold 7), with no empty request after it.
 *
 * The agent is Brunch's HASH agent (`createHashAgent`), so every tool has
 * HASH's name and every Petrinaut tool names the editor. The browser reports
 * Brunch's revision metadata and refuses a claimed change whose
 * `expectedRevision` the net has moved past by other means.
 *
 * Requests are counted by `count-provider-requests.ts`, preloaded into the
 * server process and imported into this one (which sends the compaction's
 * summary request): one ledger line per HTTP request to the provider API
 * (Anthropic, OpenAI or OpenRouter), refusing any beyond the budget. The
 * driver aborts a turn once the preload refuses a request. Afterwards it
 * stops the server, reads the stored conversation, prints its observations
 * per scenario and drops the conversation's schema.
 */
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  createRegistry,
  Harness,
  type EntryId,
  type HarnessOptions,
  ROOT_CONVERSATION_ID,
} from "@earendil-works/pi-durable";
import {
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Pool } from "pg";
import * as v from "valibot";

import {
  type BrowserCallClaim,
  type BrowserContext,
  brunchTools,
  canonicalContent,
  type ClientToolResultMetadata,
  hashProcessEditorId,
  type NetStructure,
  vBrowserCallResultBody,
} from "@hashintel/brunch-agent";

import { createHashAgent } from "../../src/agent/hash-agent";
import { createHostBinding } from "../../src/agent/host-binding";
import { BrowserCallsDoc } from "../../src/browser-call/browser-call";
import { LedgerDoc } from "../../src/ledger";
import { conversationSchema } from "../../src/server/conversation-storage";
import { browserCallsPrefix } from "../../src/server/start-durable-agents-server";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../src/storage/postgres/postgres-storage";

const model = process.env.SMOKE_MODEL ?? "openai/gpt-6.1-sol";
/**
 * `SMOKE_DRY_RUN=1` checks the wiring without spending: the preload refuses
 * every request (budget 0, its own ledger) and only turn 1 runs, briefly.
 */
const dryRun = process.env.SMOKE_DRY_RUN === "1";
/**
 * `SMOKE_PROBE=no-read-change` runs only one turn that asks for a change
 * and tells the model not to read, so a model that reads unprompted still
 * meets the server's refusal of a change with no view in context.
 */
const noReadProbe = process.env.SMOKE_PROBE === "no-read-change";
/** Smoke round 4's estimate is about 25 requests (`hash-agent-port.md` §6). */
const budget = dryRun ? 0 : 25;
const turnTimeoutMs = dryRun ? 20_000 : 4 * 60_000;
/** One ledger per model, so a new model's round starts at 0. */
const ledgerPath = join(
  tmpdir(),
  dryRun
    ? `durable-agents-smoke-dry-${randomUUID()}.jsonl`
    : `durable-agents-smoke-requests-${model.split("/").at(-1)}.jsonl`,
);
const preload = fileURLToPath(
  new URL("count-provider-requests.ts", import.meta.url),
);
// This process sends the compaction's summary request: count and bound it on the same ledger.
process.env.SMOKE_REQUEST_LEDGER = ledgerPath;
process.env.SMOKE_REQUEST_BUDGET = String(budget);
await import(pathToFileURL(preload).href);
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
  tools?: number;
  additionalTools?: number[];
  promptCacheKey?: boolean;
  pid?: number;
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
const requestsRefused = () =>
  ledgerLines().filter(({ event }) => event === "refused").length;

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

type NetItem = Record<string, unknown> & { id: string; name?: unknown };
type Arc = Record<string, unknown> & { placeId?: unknown; endpoint?: unknown };

/** Mutation tools the scripted browser applies to its net. */
const netChangingTools = new Set([
  "petrinaut_create_place",
  "petrinaut_create_transition",
  "petrinaut_create_arc",
  "petrinaut_set_net_title",
]);
/** Net reads the scripted browser answers, each reporting the revision it saw. */
const readTools = new Set(["petrinaut_get_net"]);
/** HASH's graph reads, answered from a small fixed graph. */
const graphReadTools = new Set<string>([
  brunchTools.hashQueryEntities,
  brunchTools.hashQueryEntityTypes,
  brunchTools.hashQueryWebs,
]);
type ToolKind = "read" | "change" | "save" | "graph" | "other";
const toolKind = (toolName: string): ToolKind =>
  readTools.has(toolName)
    ? "read"
    : netChangingTools.has(toolName)
      ? "change"
      : toolName === brunchTools.appSaveNet
        ? "save"
        : graphReadTools.has(toolName)
          ? "graph"
          : "other";

/**
 * A browser that applies place, transition and arc additions to a small net
 * it keeps and answers net reads from it, in the panel's output shapes:
 * `{ title, target, applied: true }` for an applied mutation
 * (`tool-summaries.ts`), `{ title, definition, extensions }` for a read
 * (`net-readers.ts`). It keeps IDs as the server issued them: HASH's schemas
 * have already converted a non-UUID ID to its stable UUID. It saves as
 * HASH's page does when the user approves the card, and answers graph reads
 * from one web with no entities.
 */
const fakeBrowser = () => {
  let title = "Untitled";
  const places: NetItem[] = [];
  const transitions: (NetItem & { inputArcs: Arc[]; outputArcs: Arc[] })[] = [];
  const nameOf = (items: NetItem[], id: unknown) =>
    items.find((item) => item.id === id)?.name ?? id;
  const placeIdOf = (arc: Arc) =>
    arc.placeId ?? (arc.endpoint as { placeId?: unknown } | undefined)?.placeId;
  const text = (value: unknown) =>
    typeof value === "string" ? value : JSON.stringify(value);
  const declined = (reason: string) => ({ applied: false, reason });
  const withoutKeys = (item: NetItem, keys: readonly string[]) =>
    Object.fromEntries(
      Object.entries(item).filter(([key]) => !keys.includes(key)),
    );
  const read = (level: "outline" | "structure" | "full") => {
    const left =
      level === "full"
        ? []
        : [
            "x",
            "y",
            "visualizerCode",
            "metadata",
            ...(level === "outline"
              ? ["lambdaCode", "transitionKernelCode"]
              : []),
          ];
    return {
      title,
      definition: {
        places: places.map((place) => withoutKeys(place, left)),
        transitions: transitions.map((transition) =>
          withoutKeys(transition, left),
        ),
        types: [],
        parameters: [],
        differentialEquations: [],
        scenarios: [],
        metrics: [],
      },
      extensions: {
        colors: true,
        stochasticity: true,
        dynamics: true,
        parameters: true,
        subnets: true,
      },
    };
  };
  const answer = (toolName: string, input: unknown): unknown => {
    const {
      targetSubnetId: _subnet,
      editor_id: _editor,
      ...fields
    }: Record<string, unknown> = typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
    const id = typeof fields.id === "string" ? fields.id : randomUUID();
    switch (toolName) {
      case "petrinaut_create_place":
        if (places.some((place) => place.id === id))
          return declined(
            `Add place ${text(fields.name)} left the document unchanged.`,
          );
        places.push({ ...fields, id });
        return {
          title: `Added place ${text(fields.name)}`,
          target: { kind: "selection", item: { type: "place", id } },
          applied: true,
        };
      case "petrinaut_create_transition":
        if (transitions.some((transition) => transition.id === id))
          return declined(
            `Add transition ${text(fields.name)} left the document unchanged.`,
          );
        transitions.push({
          ...fields,
          id,
          inputArcs: Array.isArray(fields.inputArcs)
            ? (fields.inputArcs as Arc[])
            : [],
          outputArcs: Array.isArray(fields.outputArcs)
            ? (fields.outputArcs as Arc[])
            : [],
        });
        return {
          title: `Added transition ${text(fields.name)}`,
          target: { kind: "selection", item: { type: "transition", id } },
          applied: true,
        };
      case "petrinaut_create_arc": {
        const transition = transitions.find(
          (each) => each.id === fields.transitionId,
        );
        const placeId = placeIdOf(fields);
        if (
          transition === undefined ||
          !places.some((place) => place.id === placeId)
        )
          return declined("Add arc left the document unchanged.");
        const arcs =
          fields.arcDirection === "input"
            ? transition.inputArcs
            : transition.outputArcs;
        if (arcs.some((arc) => placeIdOf(arc) === placeId))
          return declined("Add arc left the document unchanged.");
        arcs.push({
          placeId,
          weight: fields.weight,
          ...(fields.arcDirection === "input"
            ? { type: fields.type ?? "standard" }
            : {}),
        });
        return {
          title: `Added ${fields.arcDirection === "input" && fields.type !== undefined && fields.type !== "standard" ? `${text(fields.type)} input` : text(fields.arcDirection)} arc`,
          detail: `${text(nameOf(places, placeId))} <-> ${text(nameOf(transitions, transition.id))}`,
          applied: true,
        };
      }
      case "petrinaut_set_net_title": {
        const previous = title;
        title = text(fields.title);
        return {
          applied: true,
          title: `Renamed net to "${title}"`,
          detail:
            previous !== title ? `Previous title: ${previous}` : undefined,
        };
      }
      case "petrinaut_get_net":
        return read(
          fields.detail === "outline" || fields.detail === "structure"
            ? fields.detail
            : "full",
        );
      case "petrinaut_get_diagnostics":
        return { diagnostics: [] };
      case brunchTools.appSaveNet:
        return {
          status: "saved",
          decisionTime: new Date().toISOString(),
          title,
          stillDirty: false,
        };
      case brunchTools.hashQueryWebs:
        return {
          webs: [
            {
              webId: "web-smoke",
              kind: "user",
              shortname: "smoke",
              name: "Smoke User",
            },
          ],
        };
      case brunchTools.hashQueryEntityTypes:
        return { entityTypes: [] };
      case brunchTools.hashQueryEntities:
        return { propertyTypes: [], entityTypes: [], entities: [] };
      default:
        return declined(`The smoke browser does not run ${toolName}.`);
    }
  };
  /**
   * The panel's host metadata (`ClientToolResultMetadata`): a read reports the
   * revision it saw; a change that changed the net reports both revisions and
   * the net's structure after it; a change that did not, only `before`.
   */
  const revision = () =>
    createHash("sha256")
      .update(canonicalContent(read("full")))
      .digest("hex")
      .slice(0, 16);
  const answerWithMetadata = (
    toolName: string,
    input: unknown,
  ): { output: unknown; metadata?: ClientToolResultMetadata } => {
    const before = revision();
    const output = answer(toolName, input);
    if (readTools.has(toolName) || graphReadTools.has(toolName))
      return { output, metadata: { documentRevision: { before } } };
    if (!netChangingTools.has(toolName)) return { output };
    const after = revision();
    if (after !== before) producedFrom.set(after, before);
    return {
      output,
      metadata:
        after === before
          ? { documentRevision: { before } }
          : {
              documentRevision: { before, after },
              readBack: read("structure").definition as unknown as NetStructure,
            },
    };
  };
  /**
   * The panel's `acceptsRevision`: whether the net has moved since `expected`
   * only through settled changes, walking back the revisions each produced.
   */
  const producedFrom = new Map<string, string>();
  const acceptsRevision = (expected: string) => {
    const visited = new Set<string>();
    let current: string | undefined = revision();
    while (current !== undefined && !visited.has(current)) {
      if (current === expected) return true;
      visited.add(current);
      current = producedFrom.get(current);
    }
    return false;
  };
  return {
    answer: answerWithMetadata,
    acceptsRevision,
    revision,
    net: () => read("full"),
    /**
     * The user's hand edit in the editor: a place the model did not add, so
     * a consequential change to a revision no settled change produced.
     */
    handEdit: () => {
      places.push({ id: "overflow", name: "Overflow" });
      return revision();
    },
  };
};

/** One tool call of a turn, in the order the model made it, with what became of it. */
type TimelineItem = {
  toolName: string;
  kind: ToolKind;
  server?: boolean;
  /** The server's refusal (or other tool error) text. */
  refused?: string;
  expectedRevision?: string;
  applied?: unknown;
  browserRefusedStale?: number;
};

/** The fields of a turn's outcome the observations read. */
type TurnOutcome = {
  label: string;
  finished: boolean;
  netChanged: boolean;
  requestsThisTurn: number;
  timeline: TimelineItem[];
  replyText: string;
};

type BrowserOutcome = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  claim: number;
  start: number;
  result: number;
  output: unknown;
  metadata?: ClientToolResultMetadata["documentRevision"];
  /** The revision the server issued a change against, from the claim. */
  expectedRevision?: string;
  /** The `/fail` status when the browser refused a stale change. */
  stale?: number;
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

  let server = await startServer();
  const transportFor = (origin: string) =>
    new DefaultChatTransport<UIMessage>({
      api: `${origin}/chat`,
      body: { binding },
    });
  let transport = transportFor(server.origin);
  const stopServer = async () => {
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
  };
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

  /**
   * Claim, start and answer one call. A claim for a call not yet issued waits
   * on the server; retry a 404 only until the stream reports the call refused
   * (a refused change is never issued) or 15 s pass.
   */
  const refusedCalls = new Set<string>();
  const playCall = async (toolCallId: string): Promise<BrowserOutcome> => {
    const giveUpAt = Date.now() + 15_000;
    let claimed = await post(callPath(toolCallId), {
      claimant,
      binding: claimBinding,
    });
    while (
      claimed.status === 404 &&
      !refusedCalls.has(toolCallId) &&
      Date.now() < giveUpAt
    ) {
      // Each try waits for the one before.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 100));
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
    const { expectedRevision } = claim;
    if (
      expectedRevision !== undefined &&
      !browser.acceptsRevision(expectedRevision)
    ) {
      const failed = await post(callPath(toolCallId, "/fail"), {
        ...proof,
        toolName: claim.toolName,
        canonicalInput: claim.input,
        disposition: "stale",
      });
      return {
        toolCallId,
        toolName: claim.toolName,
        input: claim.input,
        claim: claimed.status,
        start: started.status,
        result: 0,
        output: null,
        expectedRevision,
        stale: failed.status,
      };
    }
    const { output, metadata } = browser.answer(claim.toolName, claim.input);
    // The result as the server receives it: in its JSON form, checked as Brunch's in-band browser calls check it.
    const body = v.parse(
      vBrowserCallResultBody,
      JSON.parse(
        JSON.stringify({
          ...proof,
          toolName: claim.toolName,
          canonicalInput: claim.input,
          output,
          ...(metadata === undefined ? {} : { metadata }),
        }),
      ),
    );
    const resulted = await post(callPath(toolCallId, "/result"), body);
    return {
      toolCallId,
      toolName: claim.toolName,
      input: claim.input,
      claim: claimed.status,
      start: started.status,
      result: resulted.status,
      output,
      metadata: metadata?.documentRevision,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    };
  };

  const turns: TurnOutcome[] = [];
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
    const toolNames = new Map<string, string>();
    const order: { toolCallId: string; toolName: string; server: boolean }[] =
      [];
    const toolErrors: {
      toolCallId: string;
      toolName?: string;
      error: string;
    }[] = [];
    const serverCalls = new Map<
      string,
      { toolName: string; input: unknown; output?: unknown }
    >();
    let aborted: string | undefined;
    const abort = (why: string) => {
      if (aborted !== undefined) return;
      aborted = why;
      print(`  aborting the turn: ${why}`);
      void post(`/chat/${encodeURIComponent(chatId)}/abort`, {});
    };
    const refusedBefore = requestsRefused();
    const watchdog = setInterval(() => {
      if (requestsRefused() > refusedBefore) abort("budget spent");
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
        if (chunk.type === "tool-input-available") {
          toolNames.set(chunk.toolCallId, chunk.toolName);
          order.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            server: chunk.providerExecuted === true,
          });
          if (chunk.providerExecuted === true)
            serverCalls.set(chunk.toolCallId, {
              toolName: chunk.toolName,
              input: chunk.input,
            });
        }
        if (chunk.type === "tool-output-available") {
          const serverCall = serverCalls.get(chunk.toolCallId);
          if (serverCall !== undefined) serverCall.output = chunk.output;
        }
        if (chunk.type === "error") print(`  error chunk: ${chunk.errorText}`);
        if (
          chunk.type === "tool-output-error" ||
          chunk.type === "tool-input-error"
        ) {
          refusedCalls.add(chunk.toolCallId);
          toolErrors.push({
            toolCallId: chunk.toolCallId,
            toolName: toolNames.get(chunk.toolCallId),
            error: chunk.errorText,
          });
          print(`  ${chunk.type} ${chunk.toolCallId}: ${chunk.errorText}`);
        }
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
    /** Every tool call in the order the model made it, with what became of it. */
    const timeline = order.map(
      ({ toolCallId, toolName, server: onServer }): TimelineItem => {
        const refusal = toolErrors.find(
          (error) => error.toolCallId === toolCallId,
        )?.error;
        const call = browserCalls.find(
          (each) => each.toolCallId === toolCallId,
        );
        return {
          toolName,
          kind: toolKind(toolName),
          ...(onServer ? { server: true } : {}),
          ...(refusal === undefined ? {} : { refused: refusal }),
          ...(call === undefined || call.claim !== 200
            ? {}
            : {
                expectedRevision: call.expectedRevision,
                ...(call.stale === undefined
                  ? {
                      applied:
                        (call.output as { applied?: unknown } | null)
                          ?.applied ?? (call.result === 200 ? "read" : false),
                    }
                  : { browserRefusedStale: call.stale }),
              }),
        };
      },
    );
    const replyText = parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n");
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
      browserCalls: browserCalls.map(({ output, ...call }) =>
        netChangingTools.has(call.toolName) ? { ...call, output } : call,
      ),
      toolErrors,
      serverCalls: [...serverCalls.entries()].map(([toolCallId, call]) => ({
        toolCallId,
        ...call,
      })),
      netChanged: browserCalls.some(
        ({ toolName, result, output }) =>
          netChangingTools.has(toolName) &&
          result === 200 &&
          (output as { applied?: unknown } | null)?.applied === true,
      ),
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
      timeline,
      replyText,
    };
    show(`${label} outcome`, outcome);
    turns.push(outcome);
    return outcome;
  };

  const remaining = () => budget - requestsUsed();
  let running = true;
  let handEdit: unknown;
  let compaction: unknown;
  try {
    if (noReadProbe) {
      // The refusal path of scenario 1, alone: a change asked for with no read, on the user's word that the net is empty.
      await runTurn(
        "Turn 1 (no-read probe)",
        "The net is empty, so there is no need to read it: just add a place called Queue.",
      );
    } else {
      let first = await runTurn(
        "Turn 1",
        "Please build it now in the editor, before asking me anything else: add a place called Queue and a transition called Serve, connected by an input arc from Queue to Serve.",
      );
      if (first.finished && !first.netChanged && !dryRun && remaining() >= 8)
        first = await runTurn(
          "Turn 1 retry",
          "You haven't changed the net yet. Use the Petrinaut tools right now to add the place Queue, the transition Serve, and an input arc from Queue to Serve. Do not ask questions first; build, then reply.",
        );
      // A turn that ends in an error stops the run: later turns would spend requests on the same failure.
      const second =
        first.finished && !dryRun && remaining() >= 3
          ? await runTurn(
              "Turn 2",
              "Also add a place called Done and an output arc from Serve to Done.",
            )
          : undefined;
      const third =
        second?.finished === true && remaining() >= 4
          ? await (async () => {
              const revision = browser.handEdit();
              const report = {
                binding: claimBinding,
                episode: `episode-${randomUUID()}`,
                seq: 0,
                revision,
              };
              const reported = await post(
                `${browserCallsPrefix}/${encodeURIComponent(chatId)}/browser-calls/hand-edits`,
                report,
              );
              handEdit = { report, response: reported };
              show("Hand edit reported", handEdit);
              return runTurn(
                "Turn 3",
                "Now add a transition called Abandon with an input arc from Queue.",
              );
            })()
          : undefined;
      if (third === undefined)
        print(
          "\nHand edit and turn 3 skipped: an earlier turn failed or fewer than four requests remain.",
        );
      if (third?.finished === true && remaining() >= 4) {
        await stopServer();
        running = false;
        compaction = await compactStored(chatId);
        show("Compaction", compaction);
        server = await startServer();
        running = true;
        transport = transportFor(server.origin);
        const fourth =
          remaining() >= 2
            ? await runTurn(
                "Turn 4 (after compaction)",
                "Add a place called Archive.",
              )
            : undefined;
        const fifth =
          fourth?.finished === true && remaining() >= 3
            ? await runTurn("Turn 5 (save)", "Please save the net to HASH now.")
            : undefined;
        if (fifth?.finished === true && remaining() >= 3)
          await runTurn(
            "Turn 6 (graph read)",
            "Which HASH webs can I see? Look them up rather than guessing.",
          );
      } else
        print(
          "\nCompaction and turn 4 skipped: an earlier turn failed or fewer than four requests remain.",
        );
    }
  } finally {
    if (running) await stopServer();
  }

  show("Scripted browser net", browser.net());
  const stored = await readStored(chatId);
  show("Stored conversation", stored);
  show(
    "Scenario observations",
    observe(turns, stored, ledgerLines(), handEdit, compaction),
  );
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

/** The text parts of a stored message's content, joined. */
const textOf = (content: unknown) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .flatMap((part: { type?: unknown; text?: unknown }) =>
            part.type === "text" && typeof part.text === "string"
              ? [part.text]
              : [],
          )
          .join("")
      : "";

/** Which of the redesign's revision fields a tool result's rendered text carries. */
const renderedFields = (text: string) => {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown> | null;
    return {
      netRevision:
        typeof parsed?.netRevision === "string" ? parsed.netRevision : false,
      netAfterChanges: parsed !== null && "netAfterChanges" in parsed,
    };
  } catch {
    return { netRevision: false, netAfterChanges: false, unparsed: true };
  }
};

/** A Harness over the conversation's schema, read-only unless `settings` are given for work it should run. */
const openHarness = async (
  chatId: string,
  settings?: HarnessOptions["settings"],
) => {
  const readOnly = settings === undefined;
  const registry = createRegistry();
  const host = createHostBinding();
  for (const extension of createHashAgent().extensions(host))
    registry.install(extension);
  const harness = await Harness.open(
    await openPostgresStorage({
      pool: poolConfig,
      schema: conversationSchema(chatId),
      readOnly,
    }),
    readOnly
      ? { models: builtinModels(), registry, readOnly }
      : { models: builtinModels(), registry, settings },
    context,
  );
  host.bind(harness);
  return harness;
};

/**
 * A manual compaction of the stored conversation while no server holds it,
 * run by this process's own Harness (its summary request is counted on the
 * same ledger). `keepRecentTokens: 1` keeps only the newest message, so the
 * kept tail holds no net view and the `net_view` section has to decide.
 * Pi's default (20,000) would keep this whole short conversation and compact
 * nothing.
 */
const compactStored = async (chatId: string) => {
  const harness = await openHarness(chatId, {
    compaction: { keepRecentTokens: 1 },
  });
  try {
    const root = (await harness.conversation(ROOT_CONVERSATION_ID, context))!;
    const before = requestsUsed();
    const taskId = await root.compact(undefined, context);
    const settled = await harness.waitForTask(taskId, context);
    return { settled, summaryRequests: requestsUsed() - before };
  } finally {
    await harness.close(context);
  }
};

/** The conversation as stored, by a read-only Harness after the server is gone. */
const readStored = async (chatId: string) => {
  const harness = await openHarness(chatId);
  try {
    const root = (await harness.conversation(ROOT_CONVERSATION_ID, context))!;
    const entries = (
      await root.entries({ order: "ascending" }, 500, undefined, context)
    ).items;
    const calls =
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {};
    const ledger = await harness.snapshot(LedgerDoc, root.id, context);
    // What the next request would see: edits applied, so pruned read-backs show their pruned form.
    const view = await root.context(context);
    let turn = 0;
    const usage: {
      turn: number;
      entry: EntryId;
      input: number;
      cacheRead: number;
      cacheWrite: number;
      output: number;
    }[] = [];
    const transcript = entries.map((entry) => {
      const message = entry.model?.[0];
      if (entry.kind === "brunch.user") turn += 1;
      if (entry.kind === "pi.system") {
        const sections = (message as { sections?: unknown } | undefined)
          ?.sections;
        const netView =
          typeof sections === "object" && sections !== null
            ? (sections as Record<string, unknown>).net_view
            : undefined;
        return {
          kind: entry.kind,
          id: entry.id,
          sectionKeys:
            typeof sections === "object" && sections !== null
              ? Object.keys(sections)
              : [],
          ...(netView === undefined ? {} : { netView }),
        };
      }
      if (message?.role === "assistant") {
        usage.push({
          turn,
          entry: entry.id,
          input: message.usage.input,
          cacheRead: message.usage.cacheRead,
          cacheWrite: message.usage.cacheWrite,
          output: message.usage.output,
        });
        return {
          kind: entry.kind,
          id: entry.id,
          turn,
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
      }
      if (message?.role === "toolResult") {
        const text = textOf(message.content);
        return {
          kind: entry.kind,
          id: entry.id,
          toolName: message.toolName,
          isError: message.isError,
          ...renderedFields(text),
          text: text.slice(0, 600),
        };
      }
      return {
        kind: entry.kind,
        id: entry.id,
        ...(entry.head === undefined ? {} : { head: entry.head }),
        ...(entry.data === undefined ? {} : { data: entry.data }),
        ...(entry.edits === undefined
          ? {}
          : {
              edits: entry.edits.map((edit) => ({
                target: edit.target,
                action: edit.action,
                text:
                  "messages" in edit
                    ? (edit.messages ?? [])
                        .map((each) => textOf(each.content))
                        .join("")
                        .slice(0, 300)
                    : undefined,
              })),
            }),
        ...(message === undefined
          ? {}
          : {
              role: message.role,
              text: textOf(message.content).slice(0, 600),
            }),
      };
    });
    return {
      transcript,
      usage,
      effectiveToolResults: view.messages.flatMap((message) =>
        message.role === "toolResult"
          ? [
              {
                toolName: message.toolName,
                isError: message.isError,
                ...renderedFields(textOf(message.content)),
                text: textOf(message.content).slice(0, 200),
              },
            ]
          : [],
      ),
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

type Stored = Awaited<ReturnType<typeof readStored>>;

/** What each scenario showed, from the turns, the stored conversation and the ledger. */
const observe = (
  turns: readonly TurnOutcome[],
  stored: Stored,
  ledger: readonly LedgerLine[],
  handEdit: unknown,
  compaction: unknown,
) => {
  const turn = (prefix: string) =>
    turns.filter(({ label }) => label.startsWith(prefix));
  const firstChange = (outcome: TurnOutcome | undefined) =>
    outcome?.timeline.find(({ kind }) => kind === "change");
  const requests = ledger.filter(({ event }) => event === "request");
  const responses = ledger.filter(({ event }) => event === "response");
  const kinds = stored.transcript.map(({ kind }) => kind);
  const toolResults = stored.transcript.filter(
    (entry): entry is Extract<typeof entry, { toolName: string }> =>
      "toolName" in entry,
  );
  const [turn1] = turn("Turn 1");
  const [turn2] = turn("Turn 2");
  const [turn3] = turn("Turn 3");
  const [turn4] = turn("Turn 4");
  const [turn5] = turn("Turn 5");
  const [turn6] = turn("Turn 6");
  const assistants = stored.transcript.filter(
    (entry): entry is Extract<typeof entry, { stopReason: unknown }> =>
      "stopReason" in entry,
  );
  const beforeFirstChange = (outcome: TurnOutcome | undefined) => {
    const index =
      outcome?.timeline.findIndex(({ kind }) => kind === "change") ?? -1;
    return index < 0 ? [] : outcome!.timeline.slice(0, index);
  };
  return {
    "1 schemas and build": {
      toolsPerRequest: requests.map(({ n, tools, additionalTools }) => ({
        n,
        tools,
        additionalTools,
      })),
      responseStatuses: [...new Set(responses.map(({ status }) => status))],
      providerErrors: responses.flatMap(({ error }) =>
        error === undefined ? [] : [error.slice(0, 300)],
      ),
      readsWithNetRevision: toolResults.filter(
        ({ toolName, netRevision }) =>
          readTools.has(toolName) && netRevision !== false,
      ).length,
      changesWithNetAfterChanges: toolResults.filter(
        ({ toolName, netAfterChanges, netRevision }) =>
          netChangingTools.has(toolName) &&
          netAfterChanges &&
          netRevision !== false,
      ).length,
      pruneWrites: kinds.filter((kind) => kind === "brunch.prune").length,
      userEntries: stored.transcript.filter(
        ({ kind }) => kind === "brunch.user",
      ),
      firstChangeRefused: firstChange(turn1)?.refused,
      readsBeforeFirstChange: beforeFirstChange(turn1).filter(
        ({ kind }) => kind === "read",
      ).length,
      netChangedInTurn1: turn1?.netChanged,
      retryTurnRun: turn("Turn 1 retry").length > 0,
    },
    "2 later change on the visible view": turn2 && {
      readsBeforeFirstChange: beforeFirstChange(turn2).filter(
        ({ kind }) => kind === "read",
      ).length,
      firstChange: firstChange(turn2),
      refusals: turn2.timeline.filter(({ refused }) => refused !== undefined)
        .length,
      admittedWithoutRead:
        beforeFirstChange(turn2).every(({ kind }) => kind !== "read") &&
        firstChange(turn2)?.refused === undefined &&
        firstChange(turn2)?.applied === true,
    },
    "3 hand edit": turn3 && {
      handEdit,
      notes: stored.transcript.filter(
        ({ kind }) => kind === "brunch.hand-edit",
      ),
      timeline: turn3.timeline,
      reply: turn3.replyText,
    },
    "4 prompt-cache prefix": stored.usage,
    "5 compaction": compaction && {
      compaction,
      compactionEntries: stored.transcript.filter(
        ({ kind }) => kind === "pi.compaction",
      ),
      netViewSections: stored.transcript.flatMap((entry) =>
        "netView" in entry ? [entry.netView] : [],
      ),
      turn4: turn4 && { timeline: turn4.timeline, reply: turn4.replyText },
    },
    "6 save and graph read": {
      turn5: turn5 && { timeline: turn5.timeline, reply: turn5.replyText },
      turn6: turn6 && { timeline: turn6.timeline, reply: turn6.replyText },
      saveResults: toolResults.filter(
        ({ toolName }) => toolName === brunchTools.appSaveNet,
      ),
      graphReadResults: toolResults.filter(({ toolName }) =>
        graphReadTools.has(toolName),
      ),
    },
    // Fold 7: a turn that ends on a ledger_commit with endTurn makes no request after it.
    "7 endTurn": [...new Set(assistants.map(({ turn: index }) => index))].map(
      (index) => {
        const last = assistants.findLast(({ turn: each }) => each === index);
        const calls = (last?.content ?? []).flatMap((part) =>
          "toolCall" in part ? [part.toolCall] : [],
        );
        return {
          turn: index,
          requests: assistants.filter(({ turn: each }) => each === index)
            .length,
          endedOnLedgerCommit: calls.includes(brunchTools.ledgerCommit),
          emptyFinal:
            last !== undefined &&
            last.content.every(
              (part) =>
                !("toolCall" in part) &&
                !("text" in part && (part.text ?? "").trim() !== ""),
            ),
        };
      },
    ),
  };
};

/**
 * `SMOKE_BROWSER_CHECK=1` plays a read, a build and a repeated change through
 * the scripted browser alone, printing its outputs and metadata, without a
 * server or a model.
 */
const checkBrowser = () => {
  const browser = fakeBrowser();
  const editor = { editor_id: hashProcessEditorId };
  const steps: [string, unknown][] = [
    ["petrinaut_get_net", { ...editor, detail: "outline" }],
    ["petrinaut_create_place", { ...editor, id: "queue", name: "Queue" }],
    ["petrinaut_create_transition", { ...editor, id: "serve", name: "Serve" }],
    [
      "petrinaut_create_arc",
      {
        ...editor,
        transitionId: "serve",
        arcDirection: "input",
        placeId: "queue",
        weight: 1,
      },
    ],
    ["petrinaut_create_place", { ...editor, id: "queue", name: "Queue" }],
    ["petrinaut_get_net", { ...editor, detail: "structure" }],
    [brunchTools.appSaveNet, { documentId: "net-check" }],
    [brunchTools.hashQueryWebs, {}],
  ];
  const start = browser.revision();
  for (const [toolName, input] of steps)
    show(toolName, browser.answer(toolName, input));
  show("acceptsRevision", {
    start: browser.acceptsRevision(start),
    current: browser.acceptsRevision(browser.revision()),
    unknown: browser.acceptsRevision("elsewhere"),
  });
};

if (process.env.SMOKE_BROWSER_CHECK === "1") checkBrowser();
else await drive();
