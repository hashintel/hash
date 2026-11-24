import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  reopenSuccessorConversation,
  type SuccessorTurnEnding,
} from "../../client/successor/successor-conversation-state";
import {
  followSuccessorStream,
  readSuccessorHistory,
} from "../../client/successor/successor-history";

import type { SuccessorConversation } from "../../client/successor/successor-endpoints";
import type { PetrinautAiMessage } from "../chat/ai-assistant-panel";
import type { useFlueChatHistory } from "./use-flue-chat-history";
import type { FlueConversationSettlement } from "@flue/sdk";
import type { UIMessage, UIMessageChunk } from "ai";

/** One read of the history, in the order reads were asked for. */
type Read = {
  readonly conversation: SuccessorConversation;
  readonly result:
    | { readonly phase: "live"; readonly messages: UIMessage[] }
    | { readonly phase: "absent" }
    | { readonly phase: "error"; readonly error: Error };
  readonly offset: number;
  /** The endings the panel saw before this read was asked for. */
  readonly endings: ReadonlyMap<string, SuccessorTurnEnding>;
};

/** What one conversation's reads share between the effect and the callbacks. */
type Reader = {
  readonly read: () => void;
  readonly recordEnding: (id: string, ending: SuccessorTurnEnding) => void;
  readonly settleSent: () => void;
  readonly recordSent: (requestId: string) => void;
};

export type SuccessorChatHistory = ReturnType<typeof useFlueChatHistory> & {
  /**
   * Follow a turn's stream from the server, the one a send of `requestId`
   * answered or a reconnect's: read the history again at each Ledger commit
   * and at the turn's end, and settle the turn in every history read after.
   */
  readonly followStream: <Chunk extends UIMessageChunk>(
    stream: ReadableStream<Chunk>,
    requestId?: string,
  ) => ReadableStream<Chunk>;
  /**
   * A stop has been answered: every turn this panel sent has ended, whether
   * or not its stream said so, so settle each and read the history again.
   */
  readonly settleStop: () => void;
};

const noMessages: PetrinautAiMessage[] = [];
const noSettlements: readonly FlueConversationSettlement[] = [];

const noReader: Reader = {
  read: () => {},
  recordEnding: () => {},
  settleSent: () => {},
  recordSent: () => {},
};

/**
 * A conversation's history on the durable agents server, in the shape the
 * panel reads Flue's observation in: the chat's messages and the snapshot
 * built from it (`reopenSuccessorConversation`). Read when the conversation
 * opens and again on `refresh`, at each Ledger commit and at the end of each
 * followed turn, one read at a time; a read asked for during one follows it.
 */
export const useSuccessorChatHistory = (
  conversation: SuccessorConversation | null,
  {
    onInvalidMetadata,
  }: {
    readonly onInvalidMetadata?: (event: {
      readonly messageId: string;
      readonly error: unknown;
    }) => void;
  } = {},
): SuccessorChatHistory => {
  const [latest, setLatest] = useState<Read>();
  const readerRef = useRef(noReader);

  useEffect(() => {
    if (conversation === null) {
      readerRef.current = noReader;
      return;
    }
    let closed = false;
    let reading = false;
    let readAgain = false;
    let asked = 0;
    const seen = new Map<
      string,
      { readonly ending: SuccessorTurnEnding; readonly before: number }
    >();
    const sent = new Set<string>();
    const readOnce = async (offset: number) => {
      const endings = new Map(
        [...seen].flatMap(([id, { ending, before }]) =>
          before < offset ? [[id, ending] as const] : [],
        ),
      );
      try {
        const history = await readSuccessorHistory(conversation);
        if (closed) return;
        setLatest({
          conversation,
          offset,
          endings,
          result: history.found
            ? { phase: "live", messages: history.messages }
            : { phase: "absent" },
        });
      } catch (caught) {
        if (closed) return;
        setLatest({
          conversation,
          offset,
          endings,
          result: {
            phase: "error",
            error: caught instanceof Error ? caught : new Error(String(caught)),
          },
        });
      }
    };
    const read = () => {
      if (reading) {
        readAgain = true;
        return;
      }
      reading = true;
      readAgain = false;
      asked += 1;
      // Each read follows the last, so the latest shown is the latest read.
      void readOnce(asked).then(() => {
        reading = false;
        if (readAgain && !closed) read();
      });
    };
    readerRef.current = {
      read,
      // A read already asked for may have been answered before the turn ended.
      recordEnding: (id, ending) => seen.set(id, { ending, before: asked }),
      recordSent: (requestId) => sent.add(requestId),
      settleSent: () => {
        for (const requestId of sent)
          if (!seen.has(requestId))
            seen.set(requestId, { ending: "aborted", before: asked });
      },
    };
    read();
    return () => {
      closed = true;
      readerRef.current = noReader;
    };
  }, [conversation]);

  const refresh = useCallback(() => readerRef.current.read(), []);
  const followStream = useCallback(
    <Chunk extends UIMessageChunk>(
      stream: ReadableStream<Chunk>,
      requestId?: string,
    ) => {
      const reader = readerRef.current;
      if (requestId !== undefined) reader.recordSent(requestId);
      return followSuccessorStream(stream, {
        onLedgerCommit: reader.read,
        onEnd: ({ ending, responseId }) => {
          if (requestId !== undefined) reader.recordEnding(requestId, ending);
          if (responseId !== undefined) reader.recordEnding(responseId, ending);
          reader.read();
        },
      });
    },
    [],
  );
  const settleStop = useCallback(() => {
    readerRef.current.settleSent();
    readerRef.current.read();
  }, []);

  const current = latest?.conversation === conversation ? latest : undefined;
  const reopened = useMemo(
    () =>
      current?.result.phase === "live"
        ? reopenSuccessorConversation(current.result.messages, {
            conversationId: current.conversation.conversationId,
            endings: current.endings,
            ...(onInvalidMetadata === undefined ? {} : { onInvalidMetadata }),
          })
        : undefined,
    [current, onInvalidMetadata],
  );
  const phase =
    conversation === null ? undefined : (current?.result.phase ?? "loading");
  return {
    error: current?.result.phase === "error" ? current.result.error : undefined,
    latestSettlement: reopened?.snapshot.settlements.at(-1),
    messages: phase === "absent" ? noMessages : reopened?.messages,
    phase,
    ready: phase === "absent" || reopened !== undefined,
    refresh,
    settlements: reopened?.snapshot.settlements ?? noSettlements,
    snapshot:
      reopened === undefined || current === undefined
        ? undefined
        : { ...reopened.snapshot, offset: String(current.offset) },
    followStream,
    settleStop,
  };
};
