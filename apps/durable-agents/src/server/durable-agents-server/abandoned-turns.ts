/**
 * Abandoned turns: a conversation's running turn that no client stream (a
 * `POST /chat` answer or a reconnect) has followed for `timeoutMs` is
 * aborted, unless a browser has claimed one of its calls, which keeps it
 * alive until that call's own expiry. Every conversation this process opens
 * starts unwatched; the clock restarts whenever its last stream ends.
 *
 * Only a conversation this process still owns is checked: another owner
 * runs its own clock, and this one must not reopen it to abort it.
 */
import { LiveDoc } from "@earendil-works/pi-durable";

import { BrowserCallsDoc } from "../../browser-call/browser-call";

import type { OpenConversation } from "./conversation-registry";
import type { Context } from "@earendil-works/chord";

export type AbandonedTurnsOptions = {
  readonly timeoutMs: number;
  /** The conversation if this process has it open and owns it; never opens one. */
  readonly ifOwned: (
    conversationId: string,
  ) => Promise<OpenConversation | undefined>;
  readonly context: Context;
  /** The clock browser call expiries are on: the Harness clock. */
  readonly now?: () => number;
};

/**
 * What an unwatched conversation's check finds: nothing to do, a turn
 * aborted, or a claimed call to wait for until `at`.
 */
type Check =
  | { readonly kind: "idle" }
  | { readonly kind: "aborted" }
  | { readonly kind: "held"; readonly at: number };

const check = async (
  { harness, root }: OpenConversation,
  context: Context,
): Promise<Check> => {
  const live = await harness.snapshot(LiveDoc, root.id, context);
  if (live?.run === undefined) return { kind: "idle" };
  const calls =
    (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {};
  const claimed = Object.values(calls).filter(
    ({ status }) => status === "claimed",
  );
  if (claimed.length > 0)
    return {
      kind: "held",
      at: Math.max(...claimed.map(({ expiresAt }) => expiresAt)),
    };
  await root.abort(context);
  return { kind: "aborted" };
};

/** The longest timeout Node's `setTimeout` takes. */
const maxTimeoutMs = 2 ** 31 - 1;

/** How soon a turn held by a call claimed past its expiry is checked again. */
const heldRecheckMs = 1_000;

export const createAbandonedTurns = (options: AbandonedTurnsOptions) => {
  const now = options.now ?? Date.now;
  /** Attached streams per conversation. */
  const streams = new Map<string, number>();
  const timers = new Map<string, NodeJS.Timeout>();
  let closed = false;

  const clear = (conversationId: string) => {
    clearTimeout(timers.get(conversationId));
    timers.delete(conversationId);
  };

  const watched = (conversationId: string) =>
    (streams.get(conversationId) ?? 0) > 0;

  const schedule = (conversationId: string, delayMs: number) => {
    clear(conversationId);
    if (closed || watched(conversationId)) return;
    const due = now() + delayMs;
    const timer = setTimeout(
      () => {
        timers.delete(conversationId);
        if (now() < due) schedule(conversationId, due - now());
        else void run(conversationId);
      },
      // Node fires a longer timeout at once; one that wakes early schedules the rest.
      Math.min(Math.max(0, delayMs), maxTimeoutMs),
    );
    // A pending check does not keep the process alive.
    timer.unref();
    timers.set(conversationId, timer);
  };

  const run = async (conversationId: string) => {
    if (closed || watched(conversationId)) return;
    const conversation = await options.ifOwned(conversationId);
    if (conversation === undefined) return;
    const found = await check(conversation, options.context).catch(
      () => undefined,
    );
    if (found?.kind === "held") {
      // After the call expires, the turn has been unwatched for longer than the timeout already. A call still
      // claimed past its expiry is about to expire; look again shortly rather than spin.
      schedule(conversationId, Math.max(found.at - now(), heldRecheckMs));
    }
  };

  return {
    /** A client stream follows the conversation; the returned function says it ended. */
    attach: (conversationId: string) => {
      streams.set(conversationId, (streams.get(conversationId) ?? 0) + 1);
      clear(conversationId);
      let detached = false;
      return () => {
        if (detached) return;
        detached = true;
        const left = (streams.get(conversationId) ?? 1) - 1;
        if (left > 0) {
          streams.set(conversationId, left);
          return;
        }
        streams.delete(conversationId);
        schedule(conversationId, options.timeoutMs);
      };
    },
    /** The conversation was opened here: unwatched from now, unless a stream follows it already. */
    opened: (conversationId: string) => {
      if (!watched(conversationId)) schedule(conversationId, options.timeoutMs);
    },
    close: () => {
      closed = true;
      for (const conversationId of timers.keys()) clear(conversationId);
    },
  };
};

export type AbandonedTurns = ReturnType<typeof createAbandonedTurns>;
