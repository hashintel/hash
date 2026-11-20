/**
 * The load probe's workload, shared by the driver and the server processes:
 * what each user message says, so the scripted model can answer any
 * conversation from its transcript alone, and the model's answer.
 *
 * A user message carries a marker naming its conversation, its turn and how
 * many places the turn adds. A conversation's first turn reads the net first
 * (`petrinaut_get_net`): net freshness admits a change only against a view of
 * the net in the model's context, and that view lasts the conversation. The
 * model counts the tool results since the last user message: fewer than the
 * turn's browser calls, it makes the next one; else it answers with the
 * turn's answer text. So a request resent after a restart gets the answer
 * the first send would have got, and a transcript holding a result twice
 * would show as a turn with too many results.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { hashProcessEditorId } from "@hashintel/brunch-agent";

import { fauxAssistantMessage, fauxToolCall } from "../../scripted-model";

import type { Message } from "@earendil-works/pi-ai";
import type { FauxResponseFactory } from "@earendil-works/pi-ai/providers/faux";

/** The browser tool every change of the workload makes: HASH's create-place, a net change. */
export const loadToolName = "petrinaut_create_place";

/** The net read a conversation's first turn makes before its changes. */
export const loadReadToolName = "petrinaut_get_net";

const loadReadInput = { editor_id: hashProcessEditorId, detail: "outline" };

export type TurnPlan = {
  readonly conversationId: string;
  readonly turn: number;
  /** Places the turn adds, one `petrinaut_create_place` call each. */
  readonly calls: number;
};

/** Whether the turn reads the net before its changes: a conversation's first turn. */
export const readsFirst = (plan: TurnPlan) => plan.turn === 1;

/** Browser calls the turn makes before its answer: its read, if any, and its changes. */
export const browserCallsOf = (plan: TurnPlan) =>
  plan.calls + (readsFirst(plan) ? 1 : 0);

const markerPattern = /\[load (\S+) turn=(\d+) calls=(\d+)\]/u;

/** The user message of a turn: its marker, then words for a person reading the transcript. */
export const userText = ({ conversationId, turn, calls }: TurnPlan) =>
  `[load ${conversationId} turn=${turn} calls=${calls}] Add ${calls} place${calls === 1 ? "" : "s"} to the net.`;

/** The turn a user message is, from its marker. */
export const planOf = (text: string): TurnPlan | undefined => {
  const match = markerPattern.exec(text);
  if (match === null) return undefined;
  return {
    conversationId: match[1] ?? "",
    turn: Number(match[2]),
    calls: Number(match[3]),
  };
};

/** The model's answer to a turn, once all its calls have results. */
export const answerText = ({ conversationId, turn }: TurnPlan) =>
  `Turn ${turn} of ${conversationId} is done.`;

export const placeInput = (plan: TurnPlan, call: number) => ({
  editor_id: hashProcessEditorId,
  id: `place-${plan.turn}-${call}`,
  // Petrinaut's names are PascalCase, digits only at the end.
  name: `Place${plan.turn * 1000 + call}`,
  colorId: null,
  dynamicsEnabled: false,
  x: 40 * call,
  y: 40 * plan.turn,
});

/** A message's text, whichever form its content takes. */
export const messageText = (message: Message): string => {
  if (message.role === "toolResult")
    return message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");
  if (typeof message.content === "string") return message.content;
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
};

export type ModelObserver = {
  /** A model call for `conversationId` starts; the returned function says it ended. */
  readonly onCall: (conversationId: string) => () => void;
  /** How long this call takes, in milliseconds. */
  readonly latencyMs: () => number;
};

/** One model step for any conversation of the workload, after `latencyMs`. */
export const loadModelStep =
  (observer: ModelObserver): FauxResponseFactory =>
  async (transcript, options) => {
    const { messages } = transcript;
    const lastUser = messages.findLastIndex(({ role }) => role === "user");
    const user = messages[lastUser];
    const plan = user === undefined ? undefined : planOf(messageText(user));
    if (plan === undefined)
      return fauxAssistantMessage("This message is not part of the load.");
    const ended = observer.onCall(plan.conversationId);
    try {
      await sleep(observer.latencyMs(), undefined, { signal: options?.signal });
    } finally {
      ended();
    }
    const results = messages
      .slice(lastUser + 1)
      .filter(({ role }) => role === "toolResult").length;
    if (results >= browserCallsOf(plan))
      return fauxAssistantMessage(answerText(plan));
    const id = `call-${randomUUID()}`;
    if (readsFirst(plan) && results === 0)
      return fauxAssistantMessage(
        fauxToolCall(loadReadToolName, loadReadInput, { id }),
        {
          stopReason: "toolUse",
        },
      );
    const change = results - (readsFirst(plan) ? 1 : 0);
    return fauxAssistantMessage(
      fauxToolCall(loadToolName, placeInput(plan, change), { id }),
      { stopReason: "toolUse" },
    );
  };
