/**
 * What the probe's conversations hold once every server is gone, read by a
 * read-only Harness per conversation on one shared pool: per turn, its user
 * inputs, answers, tool calls and results, and errors; the conversation's
 * browser calls; whether a run is still live; and the newest run failure.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  Harness,
  LiveDoc,
  ROOT_CONVERSATION_ID,
} from "@earendil-works/pi-durable";

import { createHostBinding } from "../../../src/agent/host-binding";
import { createPetrinautAgent } from "../../../src/agent/petrinaut-agent";
import {
  type BrowserCallRecord,
  BrowserCallsDoc,
} from "../../../src/browser-call/browser-call";
import { conversationSchema } from "../../../src/server/conversation-storage";
import { openPostgresStorage } from "../../../src/storage/postgres/postgres-storage";
import { scriptedModel } from "../../scripted-model";
import { answerText, messageText, planOf } from "./workload";

import type { Pool } from "pg";

const context = BACKGROUND_CONTEXT;

export type StoredTurn = {
  readonly userInputs: number;
  readonly answers: number;
  readonly toolCalls: readonly string[];
  /** Results per tool call ID. */
  readonly toolResults: ReadonlyMap<string, number>;
  /** Error and abort messages of the turn's model responses. */
  readonly errors: readonly string[];
};

export type StoredConversation = {
  readonly conversationId: string;
  readonly exists: boolean;
  readonly turns: ReadonlyMap<number, StoredTurn>;
  readonly calls: readonly BrowserCallRecord[];
  readonly running: boolean;
  readonly runFailure: string | undefined;
};

type MutableTurn = {
  userInputs: number;
  answers: number;
  toolCalls: string[];
  toolResults: Map<string, number>;
  errors: string[];
};

const emptyTurn = (): MutableTurn => ({
  userInputs: 0,
  answers: 0,
  toolCalls: [],
  toolResults: new Map(),
  errors: [],
});

export const readStoredConversation = async (
  pool: Pool,
  conversationId: string,
): Promise<StoredConversation> => {
  const schema = conversationSchema(conversationId);
  const exists =
    (
      await pool.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [
        schema,
      ])
    ).rowCount === 1;
  if (!exists)
    return {
      conversationId,
      exists,
      turns: new Map(),
      calls: [],
      running: false,
      runFailure: undefined,
    };
  const registry = createRegistry();
  const host = createHostBinding();
  for (const extension of createPetrinautAgent().extensions(host))
    registry.install(extension);
  const harness = await Harness.open(
    await openPostgresStorage({ pool, schema, readOnly: true }),
    { models: scriptedModel([]).models, registry, readOnly: true },
    context,
  );
  host.bind(harness);
  try {
    const root = await harness.conversation(ROOT_CONVERSATION_ID, context);
    if (root === undefined) throw new Error(`${conversationId} has no root.`);
    const entries = (
      await root.entries({ order: "ascending" }, 1_000, undefined, context)
    ).items;
    const turns = new Map<number, MutableTurn>();
    let current: MutableTurn | undefined;
    let currentTurn = 0;
    for (const entry of entries)
      for (const message of entry.model ?? []) {
        if (message.role === "user") {
          const plan = planOf(messageText(message));
          if (plan === undefined) continue;
          currentTurn = plan.turn;
          current = turns.get(plan.turn) ?? emptyTurn();
          turns.set(plan.turn, current);
          current.userInputs += 1;
        } else if (current !== undefined && message.role === "assistant") {
          for (const part of message.content)
            if (part.type === "toolCall") current.toolCalls.push(part.id);
          if (
            messageText(message) ===
            answerText({ conversationId, turn: currentTurn, calls: 0 })
          )
            current.answers += 1;
          if (
            message.stopReason === "error" ||
            message.stopReason === "aborted"
          )
            current.errors.push(
              `${message.stopReason}: ${message.errorMessage ?? ""}`,
            );
        } else if (current !== undefined && message.role === "toolResult") {
          current.toolResults.set(
            message.toolCallId,
            (current.toolResults.get(message.toolCallId) ?? 0) + 1,
          );
          if (message.isError)
            current.errors.push(`tool error: ${messageText(message)}`);
        }
      }
    const live = await harness.snapshot(LiveDoc, root.id, context);
    const calls =
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {};
    return {
      conversationId,
      exists,
      turns,
      calls: Object.values(calls),
      running: live?.run !== undefined,
      runFailure:
        live?.runFailure === undefined
          ? undefined
          : `${live.runFailure.reason}${live.runFailure.detail === undefined ? "" : `: ${live.runFailure.detail}`}`,
    };
  } finally {
    await harness.close(context);
  }
};
