import {
  brunchSignals,
  durableHistoryPartTypes,
  ledgerCommentsMessage,
  parseDurableHistoryMessageMetadata,
  parseLedgerComments,
  type DurableHistoryMessageMetadata,
} from "@hashintel/brunch-agent";

import type {
  PetrinautAiMessage,
  PetrinautAiMessageMetadata,
} from "../../ui/chat/ai-assistant-panel";
import type {
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationSettlement,
  FlueConversationState,
} from "@flue/sdk";
import type { UIMessage } from "ai";

/** How a turn ended, as a stream the panel followed told it. */
export type SuccessorTurnEnding = FlueConversationSettlement["outcome"];

/** A history message, read by what the panel makes of it. */
type HistoryItem =
  | {
      readonly kind: "input";
      readonly message: UIMessage;
      readonly metadata: DurableHistoryMessageMetadata;
      /** The comments' entry data, for a turn of Ledger comments. */
      readonly comments?: unknown;
    }
  | { readonly kind: "note"; readonly message: UIMessage }
  | {
      readonly kind: "response";
      readonly message: UIMessage;
      readonly metadata: DurableHistoryMessageMetadata;
    };

const isNote = (message: UIMessage) =>
  message.role === "user" &&
  message.parts.length > 0 &&
  message.parts.every(({ type }) => type === durableHistoryPartTypes.handEdit);

const commentsData = (message: UIMessage) => {
  const part = message.parts.find(
    ({ type }) => type === durableHistoryPartTypes.ledgerComments,
  );
  if (part === undefined) return undefined;
  const data: unknown = "data" in part ? part.data : undefined;
  return { data };
};

/** A comment turn's body as the panel sent it, which the Ledger fold and its display parse. */
const commentsBody = (data: unknown): string => {
  const sent =
    typeof data === "object" && data !== null && "comments" in data
      ? data.comments
      : null;
  const comments = parseLedgerComments(JSON.stringify({ comments: sent }));
  return comments === undefined
    ? JSON.stringify(data)
    : ledgerCommentsMessage(comments).body;
};

const historyItems = (
  history: readonly UIMessage[],
  onInvalidMetadata:
    | ((event: { messageId: string; error: unknown }) => void)
    | undefined,
): HistoryItem[] =>
  history.flatMap((message): HistoryItem[] => {
    if (message.role === "system") return [];
    if (isNote(message)) return [{ kind: "note", message }];
    let metadata: DurableHistoryMessageMetadata = {};
    try {
      metadata = parseDurableHistoryMessageMetadata(message.metadata ?? {});
    } catch (error) {
      onInvalidMetadata?.({ messageId: message.id, error });
    }
    if (message.role === "assistant")
      return [{ kind: "response", message, metadata }];
    const comments = commentsData(message);
    return [
      comments === undefined
        ? { kind: "input", message, metadata }
        : { kind: "input", message, metadata, comments: comments.data },
    ];
  });

const toolNameOf = (type: string) =>
  type.startsWith("tool-") ? type.slice("tool-".length) : undefined;

/** A history part as Flue's snapshot holds it: every tool call a dynamic tool, step boundaries dropped. */
const conversationPart = (
  part: UIMessage["parts"][number],
): FlueConversationPart[] => {
  if (part.type === "text" || part.type === "reasoning")
    return [{ type: part.type, text: part.text, state: "done" }];
  if (part.type === "file")
    return [
      {
        type: "file",
        mediaType: part.mediaType,
        url: part.url,
        ...(part.filename === undefined ? {} : { filename: part.filename }),
      },
    ];
  if (part.type.startsWith("data-") && "data" in part)
    return [{ type: part.type as `data-${string}`, data: part.data }];
  const toolName =
    part.type === "dynamic-tool" ? part.toolName : toolNameOf(part.type);
  if (toolName === undefined || !("toolCallId" in part)) return [];
  const call = {
    type: "dynamic-tool" as const,
    toolName,
    toolCallId: part.toolCallId,
  };
  switch (part.state) {
    case "output-available":
      return [
        {
          ...call,
          state: "output-available",
          input: part.input,
          output: part.output,
        },
      ];
    case "output-error":
      return [
        {
          ...call,
          state: "output-error",
          input: part.input,
          errorText: part.errorText,
        },
      ];
    case "output-denied":
      return [
        {
          ...call,
          state: "output-error",
          input: part.input,
          errorText: "denied",
        },
      ];
    default:
      return [{ ...call, state: "input-available", input: part.input }];
  }
};

const textParts = (message: UIMessage): FlueConversationPart[] =>
  message.parts.flatMap((part) =>
    part.type === "text"
      ? [{ type: "text", text: part.text, state: "done" } as const]
      : [],
  );

const snapshotMessage = (
  item: HistoryItem,
  answers: string | undefined,
): FlueConversationMessage => {
  const { id } = item.message;
  switch (item.kind) {
    case "note":
      return {
        id,
        role: "system",
        purpose: "dispatch",
        display: "hidden",
        parts: item.message.parts.flatMap(conversationPart),
      };
    case "input":
      return "comments" in item
        ? {
            id,
            role: "system",
            purpose: "dispatch",
            display: "visible",
            submissionId: id,
            signal: { tagName: brunchSignals.ledgerComments },
            parts: [
              {
                type: "text",
                text: commentsBody(item.comments),
                state: "done",
              },
            ],
          }
        : {
            id,
            role: "user",
            purpose: "user",
            display: "visible",
            submissionId: id,
            parts: textParts(item.message),
          };
    case "response":
      return {
        id,
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        ...(answers === undefined ? {} : { submissionId: answers }),
        parts: item.message.parts.flatMap(conversationPart),
      };
  }
};

/**
 * How each input's turn ended, as far as the history and the panel's own
 * streams show: its own outcome, a later turn having run (one turn runs at a
 * time), or the ending of a stream the panel followed. A turn with none of
 * these may still be running, and has no settlement.
 */
const settlements = (
  items: readonly HistoryItem[],
  endings: ReadonlyMap<string, SuccessorTurnEnding>,
): FlueConversationSettlement[] =>
  items.flatMap((item, index): FlueConversationSettlement[] => {
    if (item.kind !== "input") return [];
    const submissionId = item.message.id;
    const settled = (outcome: SuccessorTurnEnding) => [
      { submissionId, outcome },
    ];
    if (item.metadata.withdrawn !== undefined)
      return settled(
        item.metadata.withdrawn === "stopped" ? "aborted" : "failed",
      );
    const after = items.slice(index + 1);
    const nextInput = after.findIndex(
      (later) =>
        later.kind === "input" && later.metadata.withdrawn === undefined,
    );
    const response = after
      .slice(0, nextInput === -1 ? undefined : nextInput)
      .find((later) => later.kind === "response");
    if (response?.metadata.stopped === true) return settled("aborted");
    if (response?.metadata.failed === true) return settled("failed");
    // Its turn ran to its end before the next one began.
    if (nextInput !== -1)
      return settled(response === undefined ? "failed" : "completed");
    const ending =
      endings.get(submissionId) ??
      (response === undefined ? undefined : endings.get(response.message.id));
    return ending === undefined ? [] : settled(ending);
  });

const endingMetadata = (
  metadata: DurableHistoryMessageMetadata,
): PetrinautAiMessageMetadata | undefined =>
  metadata.stopped === true
    ? { stopped: true }
    : metadata.failed === true
      ? { failed: true }
      : undefined;

/** The chat's messages: what the live stream showed, an ending for each withdrawn input, and no notes. */
const chatMessages = (items: readonly HistoryItem[]): PetrinautAiMessage[] =>
  items.flatMap((item): PetrinautAiMessage[] => {
    if (item.kind === "note") return [];
    const { id, role } = item.message;
    if (item.kind === "response") {
      const metadata = endingMetadata(item.metadata);
      return [
        {
          id,
          role,
          parts: item.message.parts as PetrinautAiMessage["parts"],
          ...(metadata === undefined ? {} : { metadata }),
        },
      ];
    }
    const sent: PetrinautAiMessage = {
      id,
      role: "user",
      parts:
        "comments" in item
          ? [{ type: "text", text: commentsBody(item.comments) }]
          : (item.message.parts.filter(
              ({ type }) => type === "text",
            ) as PetrinautAiMessage["parts"]),
    };
    const { withdrawn } = item.metadata;
    return withdrawn === undefined
      ? [sent]
      : [
          sent,
          {
            id: `withdrawn:${id}`,
            role: "assistant",
            parts: [],
            metadata:
              withdrawn === "stopped" ? { stopped: true } : { failed: true },
          },
        ];
  });

/**
 * A conversation on the durable agents server, from its history
 * (`GET /chat/:id/messages`), as the panel reads one on Flue: the snapshot
 * its Ledger fold, stop-on-leave, Voice and replay read, with Flue's
 * purposes, signals, submissions and settlements and every tool call a
 * dynamic tool; and the chat's messages.
 *
 * An input's submission is its message ID, its request ID, as the
 * successor's transport admits it; a response answers the input before it.
 * A Ledger-comment turn is a comment signal and a hand-edit note a hidden
 * message, so neither but the comments opens a Ledger turn. `endings` are
 * the turns the panel saw end on a stream it followed, by request or
 * response ID, read only into a history fetched after they ended.
 */
export const reopenSuccessorConversation = (
  history: readonly UIMessage[],
  {
    conversationId,
    endings = new Map(),
    onInvalidMetadata,
  }: {
    /** The raw conversation ID the panel keys its chat on. */
    readonly conversationId: string;
    readonly endings?: ReadonlyMap<string, SuccessorTurnEnding>;
    readonly onInvalidMetadata?: (event: {
      readonly messageId: string;
      readonly error: unknown;
    }) => void;
  },
): {
  readonly snapshot: FlueConversationState;
  readonly messages: PetrinautAiMessage[];
} => {
  const items = historyItems(history, onInvalidMetadata);
  let answers: string | undefined;
  const messages = items.map((item) => {
    if (item.kind === "input" && item.metadata.withdrawn === undefined)
      answers = item.message.id;
    return snapshotMessage(item, answers);
  });
  return {
    snapshot: {
      conversationId,
      messages,
      settlements: settlements(items, endings),
    },
    messages: chatMessages(items),
  };
};
