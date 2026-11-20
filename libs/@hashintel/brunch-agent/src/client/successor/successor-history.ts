import * as v from "valibot";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  type SuccessorConversation,
  successorEndpoints,
  successorHeaders,
} from "./successor-endpoints";

import type { SuccessorTurnEnding } from "./successor-conversation-state";
import type { UIMessage, UIMessageChunk } from "ai";

/** `GET /chat/:id/messages`'s answer: AI SDK messages, checked only as far as the panel reads them blind. */
const successorHistorySchema = v.array(
  v.looseObject({
    id: v.string(),
    role: v.picklist(["system", "user", "assistant"]),
    metadata: v.optional(v.unknown()),
    parts: v.array(v.looseObject({ type: v.string() })),
  }),
);

const refusalSchema = v.object({ error: v.string() });

/** The reason a refusal gives: its JSON `error`, or its text. */
const refusalReason = async (response: Response) => {
  const text = await response.text();
  try {
    const refusal = v.safeParse(refusalSchema, JSON.parse(text));
    return refusal.success ? refusal.output.error : text;
  } catch {
    return text;
  }
};

/**
 * Read a conversation's history from the durable agents server, which
 * creates nothing: its messages, or that the server has no such
 * conversation. Any other answer rejects with the server's reason.
 */
export const readSuccessorHistory = async (
  conversation: SuccessorConversation,
  signal?: AbortSignal,
): Promise<
  | { readonly found: false }
  | { readonly found: true; readonly messages: UIMessage[] }
> => {
  const { messages } = await successorEndpoints(conversation);
  const response = await (conversation.fetch ?? globalThis.fetch)(messages, {
    headers: successorHeaders(conversation),
    credentials: "include",
    cache: "no-store",
    ...(signal === undefined ? {} : { signal }),
  });
  if (response.status === 404) return { found: false };
  if (!response.ok)
    throw new Error(
      `The server did not answer the conversation's history (HTTP ${response.status}): ${await refusalReason(response)}`,
    );
  return {
    found: true,
    messages: v.parse(
      successorHistorySchema,
      await response.json(),
    ) as UIMessage[],
  };
};

const endings: Partial<Record<UIMessageChunk["type"], SuccessorTurnEnding>> = {
  finish: "completed",
  abort: "aborted",
  error: "failed",
};

/**
 * `stream`, a turn's stream from the durable agents server, passed through
 * unchanged, telling `onLedgerCommit` of each `ledger_commit` result in it
 * and `onEnd` of how the turn ended, with the response it streamed. A
 * stream cut off before its end tells nothing: the turn may run on.
 */
export const followSuccessorStream = <Chunk extends UIMessageChunk>(
  stream: ReadableStream<Chunk>,
  {
    onLedgerCommit,
    onEnd,
  }: {
    readonly onLedgerCommit?: () => void;
    readonly onEnd?: (end: {
      readonly ending: SuccessorTurnEnding;
      readonly responseId?: string;
    }) => void;
  },
): ReadableStream<Chunk> => {
  let responseId: string | undefined;
  const commits = new Set<string>();
  return stream.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      transform: (chunk, controller) => {
        controller.enqueue(chunk);
        if (chunk.type === "start" && chunk.messageId !== undefined)
          responseId = chunk.messageId;
        else if (
          chunk.type === "tool-input-available" &&
          chunk.toolName === brunchTools.ledgerCommit
        )
          commits.add(chunk.toolCallId);
        else if (
          (chunk.type === "tool-output-available" ||
            chunk.type === "tool-output-error") &&
          commits.delete(chunk.toolCallId)
        )
          onLedgerCommit?.();
        const ending = endings[chunk.type];
        if (ending !== undefined)
          onEnd?.(
            responseId === undefined ? { ending } : { ending, responseId },
          );
      },
    }),
  );
};
