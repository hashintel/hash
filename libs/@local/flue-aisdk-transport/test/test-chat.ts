/**
 * `TestChatState` and `TestChat` from `packages/ai/src/ui/chat.test.ts` in
 * vercel/ai at `ai@6.0.286` (38f42fce), Apache-2.0, with status history added.
 */
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type UIMessage,
} from "ai";

class TestChatState implements ChatState<UIMessage> {
  public statuses: ChatStatus[] = [];
  #status: ChatStatus = "ready";
  public messages: UIMessage[];
  public error: Error | undefined = undefined;

  public constructor(initialMessages: UIMessage[] = []) {
    this.messages = initialMessages;
  }

  public get status(): ChatStatus {
    return this.#status;
  }

  public set status(status: ChatStatus) {
    this.#status = status;
    this.statuses.push(status);
  }

  public pushMessage = (message: UIMessage) => {
    this.messages = this.messages.concat(message);
  };

  public popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  public replaceMessage = (index: number, message: UIMessage) => {
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  };

  public snapshot = <T>(value: T): T => structuredClone(value);
}

export class TestChat extends AbstractChat<UIMessage> {
  public constructor(init: ChatInit<UIMessage>) {
    super({ ...init, state: new TestChatState(init.messages ?? []) });
  }

  /** Every status the chat passed through, in order. */
  public get statuses(): readonly ChatStatus[] {
    return (this.state as TestChatState).statuses;
  }
}
