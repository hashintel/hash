/**
 * Gate 1a: a browser-tool turn, driven by AI SDK's stock
 * `DefaultChatTransport` over HTTP against real server processes, survives
 * the server being SIGKILLed mid-call and completes exactly once after a
 * restart.
 *
 * Usage: `turbo run proof:restart-turn --filter @apps/durable-agents`, with
 * the compose Postgres up. No model is called (scripted faux models answer);
 * it takes a few seconds.
 *
 * Without arguments this is the driver; with a role it is a server process
 * (`proof/server.ts`), running the same wiring `src/main.ts` runs. The driver:
 *
 * 1. sends a user message to server 1, whose model reads the net (the driver
 *    answers the read as the browser), then calls `addPlace`;
 * 2. as the browser (one claimant, the conversation's binding), waits for the
 *    `tool-input-available` chunk, then claims and starts the call;
 * 3. SIGKILLs server 1, the call started and without a result;
 * 4. starts server 2 on the same database and reconnects the client;
 * 5. reconnects a second, read-only client, which never claims;
 * 6. re-sends the first claimant's claim, then posts the browser's result
 *    with the capability it already holds;
 *
 * then checks the pass criteria and exits non-zero when one fails.
 *
 * Baseline, for the report only (not run): Brunch on Flue loses the call on
 * the same kill; its rendezvous is an in-memory map with a 25 s lease.
 */
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  type EntryRecord,
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
  type BrowserContext,
  browserToolFacts,
  canonicalContent,
} from "@hashintel/brunch-agent";

import { createHostBinding } from "../../src/agent/host-binding";
import { createPetrinautAgent } from "../../src/agent/petrinaut-agent";
import {
  type BrowserCallRecord,
  BrowserCallsDoc,
} from "../../src/browser-call/browser-call";
import { conversationSchema } from "../../src/server/conversation-storage";
import { browserCallsPrefix } from "../../src/server/start-durable-agents-server";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../src/storage/postgres/postgres-storage";
import { print } from "../browser-call/proof/server-process";
import { scriptedModel } from "../scripted-model";
import {
  answer,
  placeInput,
  readMetadata,
  readOutput,
  readToolName,
  serve,
  toolName,
} from "./proof/server";
import { type ServerProcess, spawnServer } from "./proof/server-process";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const browserOutput = { ok: true, placeId: placeInput.id };

const show = (heading: string, value: unknown) =>
  print(`\n${heading}\n${JSON.stringify(value, null, 2)}`);

/** Read a chunk stream, keeping every chunk read and how it ended. */
const recorder = (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  let ending: "done" | { error: string } | undefined;
  const until = async (predicate: (chunk: UIMessageChunk) => boolean) => {
    for (;;) {
      let next: ReadableStreamReadResult<UIMessageChunk>;
      try {
        // Each read depends on the one before.
        // eslint-disable-next-line no-await-in-loop
        next = await reader.read();
      } catch (error) {
        ending = { error: String(error) };
        return undefined;
      }
      if (next.done) {
        ending = "done";
        return undefined;
      }
      chunks.push(next.value);
      if (predicate(next.value)) return next.value;
    }
  };
  return {
    chunks,
    until,
    drain: () => until(() => false),
    ending: () => ending,
    types: () => chunks.map(({ type }) => type),
  };
};

type Recorder = ReturnType<typeof recorder>;

const startOf = (chunks: readonly UIMessageChunk[]) => {
  const start = chunks.find(({ type }) => type === "start");
  return start?.type === "start" ? start.messageId : undefined;
};

/** The message AI SDK's own reducer builds from `chunks`. */
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

const textOf = (entry: EntryRecord) =>
  (entry.model ?? [])
    .flatMap((message) =>
      typeof message.content === "string"
        ? [message.content]
        : message.content.flatMap((part) =>
            part.type === "text" ? [part.text] : [],
          ),
    )
    .join("");

/** The conversation as stored, read by a read-only Harness after both servers are gone. */
const readStored = async (chatId: string) => {
  const registry = createRegistry();
  const host = createHostBinding();
  for (const extension of createPetrinautAgent().extensions(host))
    registry.install(extension);
  const harness = await Harness.open(
    await openPostgresStorage({
      pool: poolConfig,
      schema: conversationSchema(chatId),
      readOnly: true,
    }),
    { models: scriptedModel([]).models, registry, readOnly: true },
    context,
  );
  host.bind(harness);
  try {
    const root = (await harness.conversation(ROOT_CONVERSATION_ID, context))!;
    const entries = (
      await root.entries({ order: "ascending" }, 100, undefined, context)
    ).items.filter(({ kind }) => kind !== "pi.system");
    const calls =
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {};
    return {
      transcript: entries.map((entry) => {
        const message = entry.model?.[0];
        return {
          kind: entry.kind,
          toolCallId:
            message?.role === "toolResult" ? message.toolCallId : undefined,
          isError: message?.role === "toolResult" ? message.isError : undefined,
          text: textOf(entry),
        };
      }),
      calls: Object.values(calls),
    };
  } finally {
    await harness.close(context);
  }
};

const drive = async () => {
  const chatId = `restart-turn-${randomUUID()}`;
  const binding: BrowserContext["binding"] = {
    conversationId: chatId,
    documentId: `net-${randomUUID()}`,
  };
  const canonicalBinding = canonicalContent(binding);
  const claimant = `tab-${randomUUID()}`;
  const userMessage: UIMessage = {
    id: `user-${randomUUID()}`,
    role: "user",
    parts: [{ type: "text", text: "Add a Washer place to the net." }],
  };
  const admin = new Pool({ ...poolConfig, max: 1 });
  const script = fileURLToPath(import.meta.url);
  const servers: ServerProcess[] = [];
  const results: { criterion: string; pass: boolean }[] = [];
  const check = (criterion: string, pass: boolean) => {
    results.push({ criterion, pass });
    print(`${pass ? "PASS" : "FAIL"}  ${criterion}`);
  };

  const start = async (label: string, role: string) => {
    const server = spawnServer(script, label, [role]);
    servers.push(server);
    const { port } = await server.next<{ port: number }>("listening");
    const origin = `http://127.0.0.1:${port}`;
    /** A client of this server: the panel's stock transport, sending its binding beside the messages. */
    const client = () =>
      new DefaultChatTransport<UIMessage>({
        api: `${origin}/chat`,
        body: { binding },
      });
    const callUrl = (callId: string, step = "") =>
      `${origin}${browserCallsPrefix}/${encodeURIComponent(chatId)}/browser-calls/${encodeURIComponent(callId)}${step}`;
    const post = async (url: string, body: unknown) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: (await response.json()) as unknown,
      };
    };
    return { server, client, callUrl, post };
  };

  try {
    print(
      `Tool ${toolName}: documentRevision = ${browserToolFacts(toolName).documentRevision}`,
    );
    print(`Conversation ${chatId}, schema ${conversationSchema(chatId)}\n`);

    print("(1) Server 1: the client sends the user message");
    const first = await start("server-1", "issue");
    const sent = recorder(
      await first.client().sendMessages({
        trigger: "submit-message",
        chatId,
        messageId: undefined,
        messages: [userMessage],
        abortSignal: undefined,
      }),
    );
    const isCall = (chunk: UIMessageChunk) =>
      chunk.type === "tool-input-available" && chunk.toolName === toolName;
    const claimBody = { claimant, binding: canonicalBinding };

    // Net freshness admits the change only against a read before it.
    const read = await sent.until(
      (chunk) =>
        chunk.type === "tool-input-available" &&
        chunk.toolName === readToolName,
    );
    if (read?.type !== "tool-input-available")
      throw new Error(
        `Server 1's stream ended without the net read: ${JSON.stringify(sent.ending())}`,
      );
    const readClaimed = await first.post(
      first.callUrl(read.toolCallId),
      claimBody,
    );
    if (readClaimed.status !== 200)
      throw new Error(`Read claim refused: ${JSON.stringify(readClaimed)}`);
    const readClaim = readClaimed.body as BrowserCallClaim;
    const readProof = {
      capability: readClaim.capability,
      binding: readClaim.binding,
    };
    await first.post(first.callUrl(read.toolCallId, "/start"), readProof);
    const readResult = await first.post(
      first.callUrl(read.toolCallId, "/result"),
      {
        ...readProof,
        toolName: readClaim.toolName,
        canonicalInput: readClaim.input,
        output: readOutput,
        metadata: readMetadata,
      },
    );
    show("The browser answered the net read on server 1", readResult);

    const issued = await sent.until(isCall);
    if (issued?.type !== "tool-input-available")
      throw new Error(
        `Server 1's stream ended without a tool call: ${JSON.stringify(sent.ending())}`,
      );
    const callId = issued.toolCallId;

    print("(2) Browser: claim and start the call over HTTP");
    const claimOnce = () => first.post(first.callUrl(callId), claimBody);
    // The stream may deliver the call before its issue commit; the panel retries a 404 too.
    let claimed = await claimOnce();
    for (let tries = 0; claimed.status === 404 && tries < 200; tries++) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 25));
      // eslint-disable-next-line no-await-in-loop
      claimed = await claimOnce();
    }
    if (claimed.status !== 200)
      throw new Error(`Claim refused: ${JSON.stringify(claimed)}`);
    const claim = claimed.body as BrowserCallClaim;
    const proofOfClaim = {
      capability: claim.capability,
      binding: claim.binding,
    };
    const started = await first.post(
      first.callUrl(callId, "/start"),
      proofOfClaim,
    );
    show("Claim and start on server 1", {
      claim: { ...claim, capability: "<capability>" },
      start: started,
    });

    print("\n(3) SIGKILL server 1 mid-call: claimed, started, no result");
    first.server.kill("SIGKILL");
    const killed = await first.server.exited;
    await sent.drain();
    show("Server 1's stream as the client saw it", {
      types: sent.types(),
      ending: sent.ending(),
    });

    print("\n(4) Server 2 on the same database: the client reconnects");
    const second = await start("server-2", "answer");
    const reconnectStream = await second.client().reconnectToStream({ chatId });
    const reconnected = reconnectStream && recorder(reconnectStream);
    await reconnected?.until(isCall);
    const reconnectedBeforeResult = [...(reconnected?.chunks ?? [])];

    print("(5) A second client reconnects; it only reads");
    const viewerStream = await second.client().reconnectToStream({ chatId });
    const viewer: Recorder | null = viewerStream && recorder(viewerStream);
    await viewer?.until(isCall);
    const viewerBeforeResult = await reduce([...(viewer?.chunks ?? [])]);

    print("(6) The first claimant re-sends its claim, then posts its result");
    const reclaimed = await second.post(second.callUrl(callId), claimBody);
    const resulted = await second.post(second.callUrl(callId, "/result"), {
      ...proofOfClaim,
      toolName: claim.toolName,
      canonicalInput: claim.input,
      output: browserOutput,
    });
    show("Re-sent claim and result on server 2", { reclaimed, resulted });
    await Promise.all([reconnected?.drain(), viewer?.drain()]);

    second.server.kill("SIGTERM");
    const { requests } = await second.server.next<{ requests: number }>(
      "stopped",
    );
    await second.server.exited;
    const stored = await readStored(chatId);
    const message = await reduce(reconnected?.chunks ?? []);
    show("Reconnected stream (chunk types)", reconnected?.types() ?? null);
    show("Second client's stream (chunk types)", viewer?.types() ?? null);
    show("Final message parts (readUIMessageStream)", message?.parts);
    show("Stored conversation", stored);

    print("\nCriteria");
    const toolPart = (parts: UIMessage["parts"] | undefined) =>
      parts?.find(({ type }) => type === `tool-${toolName}`) as
        | { toolCallId: string; state: string; output?: unknown }
        | undefined;
    const contentParts = (message?.parts ?? []).filter(
      ({ type }) => type !== "step-start",
    );
    const finalTool = toolPart(contentParts);
    const finalRead = contentParts.at(0) as
      | { type: string; state?: string }
      | undefined;
    const finalText = contentParts.at(2);
    const types = reconnected?.types() ?? [];
    const record = stored.calls.find(
      (call: BrowserCallRecord) => call.toolCallId === callId,
    );

    check(
      "server 1 was SIGKILLed after the call was claimed and started, with no result",
      killed.signal === "SIGKILL" &&
        started.status === 200 &&
        !sent.chunks.some(
          (chunk) =>
            chunk.type === "tool-output-available" &&
            chunk.toolCallId === callId,
        ),
    );
    check(
      "the reconnect stream starts from the committed view: the pending tool call, under the original message id",
      reconnected !== null &&
        reconnectedBeforeResult.at(0)?.type === "start" &&
        startOf(reconnectedBeforeResult) === startOf(sent.chunks) &&
        startOf(sent.chunks) !== undefined &&
        reconnectedBeforeResult.some(
          (chunk) =>
            chunk.type === "tool-input-available" &&
            chunk.toolCallId === callId &&
            isDeepStrictEqual(chunk.input, placeInput),
        ) &&
        !reconnectedBeforeResult.some(
          (chunk) =>
            chunk.type === "tool-output-available" &&
            chunk.toolCallId === callId,
        ),
    );
    check(
      "the reconnect stream completes the turn under the same message id",
      types.at(-1) === "finish" &&
        types.filter((type) => type === "start").length === 1 &&
        message?.id === startOf(sent.chunks),
    );
    check(
      "the final parts are the net read, exactly one tool part for the call (output-available, the browser's output) and the answer text",
      contentParts.length === 3 &&
        finalRead?.type === `tool-${readToolName}` &&
        finalRead.state === "output-available" &&
        finalTool?.toolCallId === callId &&
        finalTool.state === "output-available" &&
        isDeepStrictEqual(finalTool.output, browserOutput) &&
        finalText?.type === "text" &&
        finalText.text === answer,
    );
    const callResults = stored.transcript.filter(
      ({ kind, toolCallId }) =>
        kind === "pi.tool-result" && toolCallId === callId,
    );
    check(
      "the stored conversation has exactly one result for the call, one for the read, and one answer",
      callResults.length === 1 &&
        callResults[0]?.isError === false &&
        stored.transcript.filter(({ kind }) => kind === "pi.tool-result")
          .length === 2 &&
        stored.transcript.filter(
          ({ kind, text }) => kind === "pi.assistant" && text === answer,
        ).length === 1,
    );
    check(
      `server 2 made exactly one model request (made ${requests})`,
      requests === 1,
    );
    check(
      "the second client saw the pending call and made no claim",
      viewer !== null &&
        toolPart(viewerBeforeResult?.parts)?.state === "input-available" &&
        toolPart(viewerBeforeResult?.parts)?.toolCallId === callId &&
        viewer.types().at(-1) === "finish" &&
        record?.claimant === claimant,
    );
    check(
      "the first claimant's re-sent claim after restart returns 409 started, not a capability",
      reclaimed.status === 409 &&
        isDeepStrictEqual(reclaimed.body, { error: "started" }),
    );
    check(
      "the browser's result, with the capability it already held, settled the call",
      resulted.status === 200 && record?.status === "settled",
    );
  } finally {
    for (const server of servers) server.kill("SIGKILL");
    await Promise.allSettled(servers.map(({ exited }) => exited));
    await admin.query(
      `DROP SCHEMA IF EXISTS "${conversationSchema(chatId)}" CASCADE`,
    );
    await admin.end();
  }
  print(
    "\nBaseline (not run): Brunch on Flue loses the call on the same kill; its rendezvous is an in-memory map with a 25 s lease.",
  );
  const failed = results.filter(({ pass }) => !pass).length;
  print(
    failed === 0
      ? `\nAll ${results.length} criteria pass.`
      : `\n${failed} of ${results.length} criteria fail.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
};

const [role] = process.argv.slice(2);
if (role === undefined) await drive();
else await serve(role);
