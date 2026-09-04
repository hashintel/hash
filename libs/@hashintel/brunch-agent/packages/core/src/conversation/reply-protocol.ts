/**
 * Substrate-neutral live reply events emitted by a harness binding.
 *
 * Transports consume this protocol; no UI wire format and no substrate type
 * crosses the boundary. Message, part, turn, and tool-call identities are
 * supplied by the binding and preserved by transports.
 */
export type ReplyPartKind = "text" | "reasoning";
export type ToolExecution = "client" | "server";

export type HarnessReplyEvent =
  | { readonly type: "response-start"; readonly messageId: string }
  | { readonly type: "turn-start"; readonly turnId: string }
  | {
      readonly type: "part-start";
      readonly kind: ReplyPartKind;
      readonly partId: string;
    }
  | {
      readonly type: "part-delta";
      readonly kind: ReplyPartKind;
      readonly partId: string;
      readonly delta: string;
    }
  | {
      readonly type: "part-end";
      readonly kind: ReplyPartKind;
      readonly partId: string;
    }
  | {
      readonly type: "tool-input";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly input: unknown;
      readonly execution: ToolExecution;
    }
  | {
      readonly type: "tool-output";
      readonly toolCallId: string;
      readonly output: unknown;
      readonly execution: ToolExecution;
    }
  | {
      readonly type: "tool-output-error";
      readonly toolCallId: string;
      readonly errorText: string;
      readonly execution: ToolExecution;
    }
  | { readonly type: "turn-finish"; readonly turnId: string }
  | {
      readonly type: "response-finish";
      readonly terminalState: "completed" | "failed" | "aborted";
      readonly finishReason: "stop" | "tool-calls" | "error";
    };
