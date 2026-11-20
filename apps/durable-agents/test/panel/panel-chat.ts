/**
 * The panel's chat as the panel tests drive it: AI SDK's chat over the
 * Brunch library's successor transport, as `useChat` drives it, without
 * React.
 */
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

import {
  BrunchPanelConversationTracker,
  createBrunchSuccessorPanelTransport,
  type SuccessorConversation,
} from "@hashintel/brunch-agent/client";

import { binding, conversationId } from "./panel-server";

type PanelTransport = ReturnType<typeof createBrunchSuccessorPanelTransport>;

export type PanelMessage =
  PanelTransport extends ChatTransport<infer Message> ? Message : never;

/** `ChatState` over a plain array, as `@ai-sdk/react` keeps one in a ref. */
class ArrayChatState<Message extends UIMessage> implements ChatState<Message> {
  public status: ChatStatus = "ready";
  public error: Error | undefined = undefined;
  public messages: Message[];
  public constructor(messages: Message[]) {
    this.messages = messages;
  }
  public pushMessage = (message: Message) => {
    this.messages = [...this.messages, message];
  };
  public popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };
  public replaceMessage = (index: number, message: Message) => {
    this.messages = this.messages.with(index, message);
  };
  public snapshot = <Value>(value: Value): Value => structuredClone(value);
}

/** AI SDK's chat, as the panel's `useChat` drives it, without React. */
export class PanelChat extends AbstractChat<PanelMessage> {
  public constructor({
    messages = [],
    ...init
  }: ChatInit<PanelMessage> & { readonly messages?: PanelMessage[] }) {
    super({ ...init, state: new ArrayChatState(messages) });
  }
}

/** The panel's transport to `conversation`, sending the panel's binding, with a tracker of its own. */
export const openPanelTransport = (conversation: SuccessorConversation) => {
  const tracker = new BrunchPanelConversationTracker();
  const transport = createBrunchSuccessorPanelTransport(conversation, tracker, {
    binding,
  });
  return { tracker, transport };
};

/** A panel tab's chat on `conversation`, opened on `messages`. */
export const openPanelChat = (
  conversation: SuccessorConversation,
  init: Omit<ChatInit<PanelMessage>, "id" | "transport"> & {
    readonly messages?: PanelMessage[];
  } = {},
) => {
  const { tracker, transport } = openPanelTransport(conversation);
  const chat = new PanelChat({ ...init, id: conversationId, transport });
  return { chat, tracker, transport };
};

export const textOf = (message: UIMessage | undefined) =>
  (message?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

/** Every chunk of a stream, to its end. */
export const drain = async (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Each read follows the last.
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
};
