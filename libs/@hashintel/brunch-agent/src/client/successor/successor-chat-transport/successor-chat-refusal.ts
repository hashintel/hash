import { FlueChatAdmissionError } from "@local/flue-aisdk-transport";

/**
 * The durable agents server refused a chat message before admitting it: a
 * 4xx, such as an unknown conversation (404) or a binding to another
 * document (409). Its message is the cause, for the panel to show; sending
 * the same message again gets the same answer.
 */
export class SuccessorChatRefusal extends FlueChatAdmissionError {
  /** The server's own words, as it answered. */
  public readonly reason: string;

  public constructor(status: number, reason: string) {
    super({ kind: "rejected", status });
    this.reason = reason;
    if (status === 404) this.message = "This conversation does not exist.";
    else if (reason.trim().length > 0) this.message = reason.trim();
  }
}
