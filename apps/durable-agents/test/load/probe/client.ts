/**
 * The load probe's clients: a router that gives each conversation to one
 * server instance by a hash of its ID, and a simulated user per
 * conversation, who sends its turns through AI SDK's stock
 * `DefaultChatTransport` and plays the browser for every call a turn
 * issues (claim, start, result, with think time between).
 *
 * Every request goes through the router when it is made, so a remap moves a
 * conversation's next request, reconnect or browser call to the new
 * instance. A stream that ends without a terminal chunk (`finish`, `error`
 * or `abort`) is reconnected with `reconnectToStream`; a 204 there means the
 * turn is no longer running. Failed requests (refused connections, 5xx) are
 * retried with the same message ID or claim, which the server deduplicates.
 */
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

import {
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

import {
  type BrowserCallClaim,
  type BrowserCallResultBody,
  type BrowserContext,
  canonicalContent,
} from "@hashintel/brunch-agent";

import { browserCallsPrefix } from "../../../src/server/start-durable-agents-server";
import { answerText, type TurnPlan, userText } from "./workload";

export type Slot = "A" | "B";

/** Conversation affinity: each conversation's slot by its ID's hash, each slot's instance by its origin. */
export const createRouter = () => {
  const origins = new Map<Slot, string>();
  const slotOf = (conversationId: string): Slot =>
    (createHash("sha256").update(conversationId).digest()[0] ?? 0) % 2 === 0
      ? "A"
      : "B";
  return {
    slotOf,
    /** Send `slot`'s conversations to `origin` from now on. */
    set: (slot: Slot, origin: string) => {
      origins.set(slot, origin);
    },
    originFor: (conversationId: string) => {
      const origin = origins.get(slotOf(conversationId));
      if (origin === undefined) throw new Error("The router has no origin.");
      return origin;
    },
  };
};

export type Router = ReturnType<typeof createRouter>;

/** Counts of failed requests and streams, by kind. */
export const createErrorCounts = () => {
  const counts = new Map<string, number>();
  return {
    count: (kind: string) => counts.set(kind, (counts.get(kind) ?? 0) + 1),
    entries: () =>
      [...counts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
  };
};

export type ErrorCounts = ReturnType<typeof createErrorCounts>;

/** A request's route with its IDs replaced, so errors group by route. */
const routeOf = (method: string, url: string) =>
  `${method} ${new URL(url).pathname
    .replace(/^\/chat\/[^/]+/u, "/chat/:id")
    .replace(
      /^\/conversations\/[^/]+\/browser-calls\/[^/]+/u,
      "/conversations/:id/browser-calls/:call",
    )}`;

const errorKind = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as
    | { code?: unknown; message?: unknown }
    | undefined;
  if (typeof cause?.code === "string") return cause.code;
  if (typeof cause?.message === "string")
    return `${error.message}: ${cause.message}`;
  return error.message;
};

const parkMillerModulus = 2_147_483_647;

/** A seeded random source (Park–Miller), so every scenario runs the same workload. */
export const seededRandom = (seed: number) => {
  let state = (Math.abs(Math.trunc(seed)) % (parkMillerModulus - 1)) + 1;
  return () => {
    state = (state * 48_271) % parkMillerModulus;
    return (state - 1) / (parkMillerModulus - 1);
  };
};

export type Timing = {
  readonly browserThinkMs: readonly [number, number];
  readonly userThinkMs: readonly [number, number];
  readonly turnTimeoutMs: number;
};

/** How a turn ended for its client. */
export type TurnOutcome =
  | "finish"
  | "error"
  | "abort"
  /** A reconnect found the conversation idle: the turn ended while no stream followed it. */
  | "idle"
  | "timeout";

export type ClientTurn = {
  readonly plan: TurnPlan;
  readonly outcome: TurnOutcome;
  readonly latencyMs: number;
  /** Streams that ended without a terminal chunk. */
  readonly drops: number;
  /** Whether the message `readUIMessageStream` assembled holds the turn's answer. */
  readonly answerSeen: boolean;
  /** Tool parts that message holds with their output. */
  readonly toolOutputsSeen: number;
  readonly errorTexts: readonly string[];
};

export type BrowserCallOutcome = {
  readonly toolCallId: string;
  /** `settled` once the server took the result; else how the browser gave up. */
  readonly outcome: string;
};

type ConversationOptions = {
  readonly conversationId: string;
  readonly plans: readonly TurnPlan[];
  readonly router: Router;
  readonly errors: ErrorCounts;
  readonly random: () => number;
  readonly timing: Timing;
  readonly onTurn: (turn: ClientTurn) => void;
};

const between = (
  random: () => number,
  [low, high]: readonly [number, number],
) => low + random() * (high - low);

/** The message AI SDK's own reducer builds from `chunks`. */
const assemble = async (chunks: readonly UIMessageChunk[]) => {
  let message: UIMessage | undefined;
  const stream = new ReadableStream<UIMessageChunk>({
    start: (controller) => {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  for await (const next of readUIMessageStream({ stream })) message = next;
  return message;
};

const terminalTypes = new Set(["finish", "error", "abort"]);

/** One simulated user: its conversation's turns in order, and the browser for their calls. */
export const runConversation = async ({
  conversationId,
  plans,
  router,
  errors,
  random,
  timing,
  onTurn,
}: ConversationOptions) => {
  const binding: BrowserContext["binding"] = {
    conversationId,
    documentId: `net-${conversationId}`,
  };
  const claimBinding = canonicalContent(binding);
  const claimant = `tab-${randomUUID()}`;
  const routerHost = "http://router.invalid";

  /** Every request, sent to the conversation's instance now, its failures counted. */
  const routedFetch = async (input: string, init?: RequestInit) => {
    const url = input.replace(routerHost, router.originFor(conversationId));
    const route = routeOf(init?.method ?? "GET", url);
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const text = await response
          .clone()
          .text()
          .catch(() => "");
        errors.count(`${route} ${response.status} ${text.slice(0, 80)}`.trim());
      }
      return response;
    } catch (error) {
      errors.count(`${route} ${errorKind(error)}`);
      throw error;
    }
  };

  const transport = new DefaultChatTransport<UIMessage>({
    api: `${routerHost}/chat`,
    body: { binding },
    fetch: (input, init) =>
      routedFetch(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        init,
      ),
  });

  const post = async (path: string, body: unknown) => {
    try {
      const response = await routedFetch(`${routerHost}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as unknown,
      };
    } catch {
      return undefined;
    }
  };

  const callPath = (callId: string, step = "") =>
    `${browserCallsPrefix}/${encodeURIComponent(conversationId)}/browser-calls/${encodeURIComponent(callId)}${step}`;

  const played = new Map<string, Promise<BrowserCallOutcome>>();
  const calls: Promise<BrowserCallOutcome>[] = [];

  /** Post until the server answers with one of `final`, or `deadline` passes; network errors, 404 and 5xx are retried. */
  const postUntil = async (
    path: string,
    body: unknown,
    final: ReadonlySet<number>,
    deadline: number,
  ) => {
    for (let tries = 0; ; tries++) {
      // Each try waits for the one before.
      // eslint-disable-next-line no-await-in-loop
      const response = await post(path, body);
      if (response !== undefined && final.has(response.status)) return response;
      if (performance.now() > deadline) return response;
      // eslint-disable-next-line no-await-in-loop
      await sleep(Math.min(25 * 2 ** tries, 400));
    }
  };

  /** Claim, start and answer one call, as Brunch's panel does. */
  const playCall = async (
    toolCallId: string,
    deadline: number,
  ): Promise<BrowserCallOutcome> => {
    const claimed = await postUntil(
      callPath(toolCallId),
      { claimant, binding: claimBinding },
      new Set([200, 403, 409]),
      deadline,
    );
    if (claimed?.status !== 200)
      return {
        toolCallId,
        outcome: `claim ${claimed?.status ?? "unreachable"} ${JSON.stringify(claimed?.body ?? null)}`,
      };
    const claim = claimed.body as BrowserCallClaim;
    const proof = { capability: claim.capability, binding: claim.binding };
    await sleep(between(random, timing.browserThinkMs) / 2);
    const started = await postUntil(
      callPath(toolCallId, "/start"),
      proof,
      new Set([200, 409]),
      deadline,
    );
    if (started?.status !== 200)
      return {
        toolCallId,
        outcome: `start ${started?.status ?? "unreachable"}`,
      };
    await sleep(between(random, timing.browserThinkMs) / 2);
    const fields = claim.input as { id?: unknown };
    const result: BrowserCallResultBody = {
      ...proof,
      toolName: claim.toolName,
      canonicalInput: claim.input,
      output: {
        ok: true,
        id: typeof fields.id === "string" ? fields.id : null,
      },
    };
    const resulted = await postUntil(
      callPath(toolCallId, "/result"),
      result,
      new Set([200, 409]),
      deadline,
    );
    return {
      toolCallId,
      outcome:
        resulted?.status === 200
          ? "settled"
          : `result ${resulted?.status ?? "unreachable"}`,
    };
  };

  const runTurn = async (plan: TurnPlan): Promise<ClientTurn> => {
    const started = performance.now();
    const deadline = started + timing.turnTimeoutMs;
    const message: UIMessage = {
      id: `user-${conversationId}-${plan.turn}`,
      role: "user",
      parts: [{ type: "text", text: userText(plan) }],
    };
    const errorTexts: string[] = [];
    let drops = 0;
    let segment: UIMessageChunk[] = [];
    let outcome: TurnOutcome | undefined;

    /** The turn's stream: the first POST, retried with the same message ID until one is answered. */
    const send = async (): Promise<ReadableStream<UIMessageChunk>> => {
      for (let tries = 0; ; tries++) {
        try {
          // Each try waits for the one before.
          // eslint-disable-next-line no-await-in-loop
          return await transport.sendMessages({
            trigger: "submit-message",
            chatId: conversationId,
            messageId: undefined,
            messages: [message],
            abortSignal: undefined,
          });
        } catch (error) {
          if (performance.now() > deadline) throw error;
          // eslint-disable-next-line no-await-in-loop
          await sleep(Math.min(50 * 2 ** tries, 500));
        }
      }
    };
    /** A reconnect, retried until an instance answers; `null` when the conversation is idle. */
    const reconnect =
      async (): Promise<ReadableStream<UIMessageChunk> | null> => {
        for (let tries = 0; ; tries++) {
          try {
            // eslint-disable-next-line no-await-in-loop
            return await transport.reconnectToStream({
              chatId: conversationId,
            });
          } catch (error) {
            if (performance.now() > deadline) throw error;
            // eslint-disable-next-line no-await-in-loop
            await sleep(Math.min(50 * 2 ** tries, 500));
          }
        }
      };

    try {
      let stream: ReadableStream<UIMessageChunk> | null = await send();
      while (stream !== null && outcome === undefined) {
        segment = [];
        try {
          // A stream is read to its end before any reconnect.
          // eslint-disable-next-line no-await-in-loop
          for await (const chunk of stream) {
            segment.push(chunk);
            if (
              chunk.type === "tool-input-available" &&
              chunk.providerExecuted !== true &&
              !played.has(chunk.toolCallId)
            ) {
              const call = playCall(chunk.toolCallId, deadline);
              played.set(chunk.toolCallId, call);
              calls.push(call);
            }
            if (chunk.type === "error") errorTexts.push(chunk.errorText);
            if (terminalTypes.has(chunk.type)) {
              outcome = chunk.type as TurnOutcome;
              break;
            }
          }
        } catch (error) {
          errors.count(`stream ${errorKind(error)}`);
        }
        if (outcome !== undefined) break;
        drops += 1;
        if (performance.now() > deadline) {
          outcome = "timeout";
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        stream = await reconnect();
        if (stream === null) outcome = "idle";
      }
    } catch (error) {
      errorTexts.push(errorKind(error));
      outcome = "timeout";
    }
    const assembled = await assemble(segment).catch(() => undefined);
    const parts = assembled?.parts ?? [];
    return {
      plan,
      outcome: outcome ?? "timeout",
      latencyMs: performance.now() - started,
      drops,
      answerSeen: parts.some(
        (part) => part.type === "text" && part.text === answerText(plan),
      ),
      toolOutputsSeen: parts.filter(
        (part) => "toolCallId" in part && part.state === "output-available",
      ).length,
      errorTexts,
    };
  };

  const turns: ClientTurn[] = [];
  for (const plan of plans) {
    // A user reads the answer before the next message; each turn follows the one before.
    // eslint-disable-next-line no-await-in-loop
    await sleep(between(random, timing.userThinkMs));
    // eslint-disable-next-line no-await-in-loop
    const turn = await runTurn(plan);
    turns.push(turn);
    onTurn(turn);
  }
  return { conversationId, turns, browserCalls: await Promise.all(calls) };
};
