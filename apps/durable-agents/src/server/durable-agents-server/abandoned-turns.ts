/**
 * Abandoned turns: a conversation's running turn that no client stream (a
 * `POST /chat` answer or a reconnect) has followed for `timeoutMs` is
 * aborted, unless one of its calls holds it (`holdsTurn`): a browser holds
 * the call before it expires, or its outcome is committed and its tool has
 * not yet committed the result. A turn held so is checked again until it
 * is not. Every conversation this process opens
 * starts unwatched; the clock restarts whenever its last stream ends.
 *
 * Only a conversation this process still owns is checked: another owner
 * runs its own clock, and this one must not reopen it to abort it.
 */
import { withAbortSignal, type Context } from "@earendil-works/chord/context";
import { LiveDoc } from "@earendil-works/pi-durable";

import {
  BrowserCallsDoc,
  holdsTurn,
  withBrowserClaimDecision,
} from "../../browser-call/browser-call";

import type { OpenConversation } from "./conversation-registry";

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
 * aborted, or a held call to check again.
 */
type Check =
  | { readonly kind: "idle" }
  | { readonly kind: "aborted" }
  | { readonly kind: "held" };

/** `stillDue` says, after every read, whether the turn may still be aborted. */
const check = async (
  { harness, root }: OpenConversation,
  context: Context,
  stillDue: () => boolean,
  signal: AbortSignal,
  now: () => number,
): Promise<Check> => {
  const live = await harness.snapshot(LiveDoc, root.id, context);
  if (live?.run === undefined || !stillDue()) return { kind: "idle" };
  const calls =
    (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {};
  if (!stillDue()) return { kind: "idle" };
  const held = await holdsTurn(harness, Object.values(calls), now(), context);
  if (!stillDue()) return { kind: "idle" };
  if (held) return { kind: "held" };
  await root.abort(withAbortSignal(signal, context));
  return { kind: "aborted" };
};

/** The longest timeout Node's `setTimeout` takes. */
const maxTimeoutMs = 2 ** 31 - 1;

/** Bound the delay after a held call settles or a check fails transiently. */
const recheckMs = 1_000;

export const createAbandonedTurns = (options: AbandonedTurnsOptions) => {
  const now = options.now ?? Date.now;
  /** Attached streams per conversation. */
  const streams = new Map<string, number>();
  const timers = new Map<string, NodeJS.Timeout>();
  /**
   * The token of each conversation's check in flight. A stream attaching or
   * the monitor closing withdraws it, since a timer cleared then cannot stop a
   * check already past it; a check whose token is gone neither aborts nor
   * reschedules.
   */
  const checks = new Map<string, AbortController>();
  const invalidate = (conversationId: string) => {
    checks.get(conversationId)?.abort();
    checks.delete(conversationId);
  };
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
    const token = new AbortController();
    checks.set(conversationId, token);
    const stillDue = () => checks.get(conversationId) === token;
    try {
      const conversation = await options.ifOwned(conversationId);
      if (!stillDue() || conversation === undefined) return;
      const found = await withBrowserClaimDecision(conversation.harness, () =>
        stillDue()
          ? check(conversation, options.context, stillDue, token.signal, now)
          : Promise.resolve({ kind: "idle" as const }),
      );
      // An idle conversation is not checked again until something schedules
      // it: a run starts only from a turn, whose stream schedules a check when
      // it detaches, or from recovery on open, which calls `opened`. A
      // hand-edit report starts no run.
      if (found.kind === "held" && stillDue())
        schedule(conversationId, recheckMs);
    } catch {
      // An unknown outcome is not an idle conversation or confirmed ownership loss.
      if (stillDue()) schedule(conversationId, recheckMs);
    } finally {
      if (stillDue()) checks.delete(conversationId);
    }
  };

  return {
    /** A client stream follows the conversation; the returned function says it ended. */
    attach: (conversationId: string) => {
      streams.set(conversationId, (streams.get(conversationId) ?? 0) + 1);
      clear(conversationId);
      invalidate(conversationId);
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
      invalidate(conversationId);
      if (!watched(conversationId)) schedule(conversationId, options.timeoutMs);
    },
    close: () => {
      closed = true;
      for (const conversationId of timers.keys()) clear(conversationId);
      for (const conversationId of checks.keys()) invalidate(conversationId);
    },
  };
};

export type AbandonedTurns = ReturnType<typeof createAbandonedTurns>;
