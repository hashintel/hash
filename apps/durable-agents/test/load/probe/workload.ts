/**
 * The load probe's workload, shared by the driver and the server processes:
 * what each user message says, so the scripted model can answer any
 * conversation from its transcript alone, and the model's answer.
 *
 * A user message carries a marker naming its conversation, its turn and how
 * many browser calls the turn makes. The model counts the tool results since
 * the last user message: fewer than the turn's calls, it calls `addPlace`
 * again; else it answers with the turn's answer text. So a request resent
 * after a restart gets the answer the first send would have got, and a
 * transcript holding a result twice would show as a turn with too many
 * results.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { fauxAssistantMessage, fauxToolCall } from "../../scripted-model";

import type { Message } from "@earendil-works/pi-ai";
import type { FauxResponseFactory } from "@earendil-works/pi-ai/providers/faux";

/** The browser tool every call of the workload makes: a canonical net mutation. */
export const loadToolName = "addPlace";

export type TurnPlan = {
  readonly conversationId: string;
  readonly turn: number;
  /** Browser calls the turn makes before its answer. */
  readonly calls: number;
};

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
  id: `place-${plan.turn}-${call}`,
  name: `Place ${plan.turn}.${call}`,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
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
    return results < plan.calls
      ? fauxAssistantMessage(
          fauxToolCall(loadToolName, placeInput(plan, results), {
            id: `call-${randomUUID()}`,
          }),
          { stopReason: "toolUse" },
        )
      : fauxAssistantMessage(answerText(plan));
  };
