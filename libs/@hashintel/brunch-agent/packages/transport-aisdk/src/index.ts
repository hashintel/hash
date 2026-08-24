/**
 * AI SDK transport for the harness reply protocol.
 *
 * This package owns only the UI-message-stream wire. An application supplies a
 * substrate-backed `runTurn`; the transport never imports a binding or Flue.
 */

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageChunk,
} from "ai";
import * as v from "valibot";

import {
  AskSubmission,
  type AskReplyAdmission,
  type HarnessReplyEvent,
} from "@hashintel/brunch-agent";

import { ASK_TOOL_NAME } from "./client-tools";

export {
  type AskReplyAdmission,
  type HarnessReplyEvent,
} from "@hashintel/brunch-agent";
export {
  ASK_TOOL_NAME,
  type BrunchAskInput,
  type BrunchAskOutput,
  parseBrunchAskInput,
  parseBrunchAskOutput,
} from "./client-tools";

export interface HarnessTurnInput {
  readonly conversationId: string;
  readonly idempotencyKey: string;
  readonly userMessage: {
    readonly id: string;
    readonly text: string;
  };
}

export type HarnessTurnRunner = (
  input: HarnessTurnInput,
  emit: (event: HarnessReplyEvent) => void,
) => Promise<void>;

export interface HarnessAskReplyInput {
  readonly conversationId: string;
  /** Existing assistant UI message whose pending tool call this continues. */
  readonly assistantMessageId: string;
  readonly idempotencyKey: string;
  readonly ask: {
    readonly toolCallId: string;
    readonly answer: string;
  };
}

/**
 * The application's ask-return seam. `admit` consults durable pending-ask
 * state before anything is dispatched; `run` projects the admitted answer
 * into the harness's user-affordance reply path and streams the resumed turn.
 */
export interface AskReplyHandler {
  admit(input: HarnessAskReplyInput): Promise<AskReplyAdmission>;
  run(
    input: HarnessAskReplyInput,
    emit: (event: HarnessReplyEvent) => void,
  ): Promise<void>;
}

export type TransportInspectionEvent =
  | {
      readonly type: "request-start";
      readonly requestId: string;
      readonly conversationId: string;
      readonly userMessageId: string;
    }
  | {
      readonly type: "response-start";
      readonly requestId: string;
      readonly messageId: string;
    }
  | {
      readonly type: "turn-start";
      readonly requestId: string;
      readonly turnId: string;
      readonly messageId: string;
    }
  | {
      readonly type: "part-emitted";
      readonly requestId: string;
      readonly kind:
        | "text"
        | "reasoning"
        | "tool-input"
        | "tool-output"
        | "tool-output-error";
      readonly partId?: string;
      readonly toolCallId?: string;
    }
  | {
      readonly type: "turn-finish";
      readonly requestId: string;
      readonly turnId: string;
    }
  | {
      readonly type: "request-finish";
      readonly requestId: string;
      readonly terminalState: "completed" | "failed" | "aborted";
      readonly finishReason: "stop" | "tool-calls" | "error";
    }
  | {
      readonly type: "ask-await";
      readonly requestId: string;
      readonly toolCallId: string;
    }
  | {
      readonly type: "ask-reply-admitted";
      readonly requestId: string;
      readonly conversationId: string;
      readonly toolCallId: string;
    }
  | {
      readonly type: "ask-reply-refused";
      readonly requestId: string;
      readonly conversationId: string;
      readonly toolCallId: string;
      readonly reason: "no-pending-ask" | "different-ask-pending";
    };

export interface AiSdkChatHandlerOptions {
  readonly runTurn: HarnessTurnRunner;
  /**
   * Ask-return support. Absent, every tool-result follow-up stays refused
   * (the FE-1436 negative contract); present, exactly the pending ask's
   * correlated submission resumes the conversation.
   */
  readonly askReply?: AskReplyHandler;
  /** Exact browser origins allowed to call this endpoint across origins. */
  readonly allowedOrigins?: readonly string[];
  /** Opt-in diagnostic sink. Events are metadata only and never re-enter the conversation. */
  readonly inspect?: (event: TransportInspectionEvent) => void;
}

const panelPartSchema = v.looseObject({
  type: v.optional(v.unknown()),
  text: v.optional(v.unknown()),
  toolName: v.optional(v.unknown()),
  toolCallId: v.optional(v.unknown()),
  state: v.optional(v.unknown()),
  output: v.optional(v.unknown()),
});

const panelMessageSchema = v.looseObject({
  id: v.optional(v.unknown()),
  role: v.optional(v.unknown()),
  parts: v.optional(v.array(panelPartSchema)),
});

const panelPostBodySchema = v.looseObject({
  id: v.optional(v.unknown()),
  messageId: v.optional(v.unknown()),
  messages: v.optional(v.array(panelMessageSchema)),
  trigger: v.optional(v.unknown()),
});

type PanelMessage = v.InferOutput<typeof panelMessageSchema>;
type PanelPostBody = v.InferOutput<typeof panelPostBodySchema>;

type TransportRequestRefusal =
  | {
      readonly reason: "invalid-chat-request";
      readonly status: 400;
      readonly error: "invalid_chat_request";
    }
  | {
      readonly reason: "tool-result-follow-up-not-supported";
      readonly status: 422;
      readonly error: "tool_result_follow_up_not_supported";
    }
  | {
      readonly reason: "invalid-ask-submission";
      readonly status: 400;
      readonly error: "invalid_ask_submission";
    };

const transportRequestRefusals = {
  invalidChatRequest: {
    reason: "invalid-chat-request",
    status: 400,
    error: "invalid_chat_request",
  },
  toolResultFollowUpNotSupported: {
    reason: "tool-result-follow-up-not-supported",
    status: 422,
    error: "tool_result_follow_up_not_supported",
  },
  invalidAskSubmission: {
    reason: "invalid-ask-submission",
    status: 400,
    error: "invalid_ask_submission",
  },
} as const satisfies Record<string, TransportRequestRefusal>;

const askReplyRefusalErrors = {
  "no-pending-ask": "ask_not_pending",
  "different-ask-pending": "ask_mismatch",
} as const;

const jsonResponse = (
  body: unknown,
  status: number,
  headers?: Headers,
): Response => Response.json(body, { status, headers });

const corsHeaders = (origin: string): Headers =>
  new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-request-id",
    vary: "Origin",
  });

const withHeaders = (response: Response, headers: Headers): Response => {
  for (const [name, value] of headers) response.headers.set(name, value);
  return response;
};

const userTextFrom = (message: PanelMessage): string | undefined => {
  if (!Array.isArray(message.parts)) return undefined;
  const text = message.parts
    .filter(
      (part): part is { readonly type: "text"; readonly text: string } =>
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
  return text.length > 0 ? text : undefined;
};

type ParsedTransportRequest =
  | { readonly kind: "initial"; readonly value: HarnessTurnInput }
  | { readonly kind: "ask-reply"; readonly value: HarnessAskReplyInput }
  | { readonly kind: "refused"; readonly refusal: TransportRequestRefusal };

const isAnsweredAskPart = (
  part: NonNullable<PanelMessage["parts"]>[number],
): boolean =>
  ((part.type === "dynamic-tool" && part.toolName === ASK_TOOL_NAME) ||
    part.type === `tool-${ASK_TOOL_NAME}`) &&
  part.state === "output-available";

/**
 * Classify one tool-result follow-up POST. A human answer submitted through
 * the registered ask component travels tool-output-shaped but is not a
 * machine tool result: exactly one submitted `brunch_ask` output on the
 * referenced assistant message is a candidate reply. Everything else —
 * Petrinaut mutation outputs, the synthetic diagnostics message — remains
 * the machine-input protocol this transport still refuses (FE-1438 owns it).
 */
const parseAskReplyTurn = (body: PanelPostBody): ParsedTransportRequest => {
  if (
    typeof body.id !== "string" ||
    body.id.length === 0 ||
    typeof body.messageId !== "string" ||
    body.messageId.length === 0 ||
    body.trigger !== "submit-message" ||
    !Array.isArray(body.messages)
  ) {
    return {
      kind: "refused",
      refusal: transportRequestRefusals.invalidChatRequest,
    };
  }

  const message = body.messages.find(
    (candidate) =>
      candidate.id === body.messageId && candidate.role === "assistant",
  );
  const askParts = (message?.parts ?? []).filter(isAnsweredAskPart);
  if (askParts.length === 0) {
    return {
      kind: "refused",
      refusal: transportRequestRefusals.toolResultFollowUpNotSupported,
    };
  }
  const askPart = askParts[0]!;
  const submission = v.safeParse(AskSubmission, askPart.output);
  if (
    askParts.length !== 1 ||
    typeof askPart.toolCallId !== "string" ||
    askPart.toolCallId.length === 0 ||
    !submission.success
  ) {
    return {
      kind: "refused",
      refusal: transportRequestRefusals.invalidAskSubmission,
    };
  }

  return {
    kind: "ask-reply",
    value: {
      conversationId: body.id,
      assistantMessageId: body.messageId,
      // Keyed by the ask itself: concurrent duplicate submissions of the same
      // pending ask collapse to one dispatch at the substrate.
      idempotencyKey: `${body.id}:ask:${askPart.toolCallId}`,
      ask: { toolCallId: askPart.toolCallId, answer: submission.output.answer },
    },
  };
};

const parseInitialTurn = (body: PanelPostBody): ParsedTransportRequest => {
  if (
    typeof body.id !== "string" ||
    body.id.length === 0 ||
    body.trigger !== "submit-message"
  ) {
    return {
      kind: "refused",
      refusal: transportRequestRefusals.invalidChatRequest,
    };
  }
  if (!Array.isArray(body.messages)) {
    return {
      kind: "refused",
      refusal: transportRequestRefusals.invalidChatRequest,
    };
  }

  const message = body.messages.at(-1) as PanelMessage | undefined;
  if (
    message?.role !== "user" ||
    typeof message.id !== "string" ||
    message.id.length === 0 ||
    message.id === "petrinaut-diagnostics-context"
  ) {
    return {
      kind: "refused",
      refusal: transportRequestRefusals.invalidChatRequest,
    };
  }
  const text = userTextFrom(message);
  if (text === undefined) {
    return {
      kind: "refused",
      refusal: transportRequestRefusals.invalidChatRequest,
    };
  }

  return {
    kind: "initial",
    value: {
      conversationId: body.id,
      idempotencyKey: `${body.id}:${message.id}`,
      userMessage: { id: message.id, text },
    },
  };
};

const toUiChunk = (event: HarnessReplyEvent): UIMessageChunk => {
  switch (event.type) {
    case "response-start":
      return { type: "start", messageId: event.messageId };
    case "turn-start":
      return { type: "start-step" };
    case "part-start":
      return { type: `${event.kind}-start`, id: event.partId };
    case "part-delta":
      return {
        type: `${event.kind}-delta`,
        id: event.partId,
        delta: event.delta,
      };
    case "part-end":
      return { type: `${event.kind}-end`, id: event.partId };
    case "tool-input":
      return {
        type: "tool-input-available",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
        ...(event.execution === "server" ? { providerExecuted: true } : {}),
      };
    case "tool-output":
      return {
        type: "tool-output-available",
        toolCallId: event.toolCallId,
        output: event.output,
        ...(event.execution === "server" ? { providerExecuted: true } : {}),
      };
    case "tool-output-error":
      return {
        type: "tool-output-error",
        toolCallId: event.toolCallId,
        errorText: event.errorText,
        ...(event.execution === "server" ? { providerExecuted: true } : {}),
      };
    case "turn-finish":
      return { type: "finish-step" };
    case "response-finish":
      switch (event.terminalState) {
        case "completed":
          return { type: "finish", finishReason: event.finishReason };
        case "failed":
          return { type: "error", errorText: "The elicitor turn failed." };
        case "aborted":
          return { type: "abort", reason: "Harness response aborted." };
      }
  }
};

const inspectionFor = (
  event: HarnessReplyEvent,
  requestId: string,
  messageId: string | undefined,
): TransportInspectionEvent | undefined => {
  switch (event.type) {
    case "response-start":
      return { type: "response-start", requestId, messageId: event.messageId };
    case "turn-start":
      return messageId === undefined
        ? undefined
        : { type: "turn-start", requestId, turnId: event.turnId, messageId };
    case "part-start":
      return {
        type: "part-emitted",
        requestId,
        kind: event.kind,
        partId: event.partId,
      };
    case "tool-input":
      return {
        type: "part-emitted",
        requestId,
        kind: "tool-input",
        toolCallId: event.toolCallId,
      };
    case "tool-output":
      return {
        type: "part-emitted",
        requestId,
        kind: "tool-output",
        toolCallId: event.toolCallId,
      };
    case "tool-output-error":
      return {
        type: "part-emitted",
        requestId,
        kind: "tool-output-error",
        toolCallId: event.toolCallId,
      };
    case "turn-finish":
      return {
        type: "turn-finish",
        requestId,
        turnId: event.turnId,
      };
    case "response-finish":
      return {
        type: "request-finish",
        requestId,
        terminalState: event.terminalState,
        finishReason: event.finishReason,
      };
    case "part-delta":
    case "part-end":
      return undefined;
  }
};

export const createAiSdkChatHandler =
  (options: AiSdkChatHandlerOptions) =>
  async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const crossOriginHeaders =
      origin !== null && options.allowedOrigins?.includes(origin) === true
        ? corsHeaders(origin)
        : undefined;
    if (origin !== null && crossOriginHeaders === undefined) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: crossOriginHeaders });
    }
    if (request.method !== "POST") {
      return jsonResponse(
        { error: "method_not_allowed" },
        405,
        crossOriginHeaders,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { error: "invalid_chat_request" },
        400,
        crossOriginHeaders,
      );
    }
    const validatedBody = v.safeParse(panelPostBodySchema, body);
    if (!validatedBody.success) {
      const refusal = transportRequestRefusals.invalidChatRequest;
      return jsonResponse(
        { error: refusal.error },
        refusal.status,
        crossOriginHeaders,
      );
    }
    const postBody = validatedBody.output;
    // The follow-up admits exactly the pending ask's correlated human answer;
    // absent an application ask-reply seam, every follow-up stays refused.
    const parsed =
      postBody.messageId !== undefined && options.askReply !== undefined
        ? parseAskReplyTurn(postBody)
        : postBody.messageId !== undefined
          ? ({
              kind: "refused",
              refusal: transportRequestRefusals.toolResultFollowUpNotSupported,
            } as const)
          : parseInitialTurn(postBody);
    if (parsed.kind === "refused") {
      return jsonResponse(
        { error: parsed.refusal.error },
        parsed.refusal.status,
        crossOriginHeaders,
      );
    }

    const requestId =
      request.headers.get("x-request-id") || crypto.randomUUID();

    let run: (emit: (event: HarnessReplyEvent) => void) => Promise<void>;
    if (parsed.kind === "ask-reply") {
      const askReply = options.askReply!;
      const admission = await askReply.admit(parsed.value);
      if (!admission.ok) {
        options.inspect?.({
          type: "ask-reply-refused",
          requestId,
          conversationId: parsed.value.conversationId,
          toolCallId: parsed.value.ask.toolCallId,
          reason: admission.reason,
        });
        return jsonResponse(
          { error: askReplyRefusalErrors[admission.reason] },
          409,
          crossOriginHeaders,
        );
      }
      options.inspect?.({
        type: "ask-reply-admitted",
        requestId,
        conversationId: parsed.value.conversationId,
        toolCallId: parsed.value.ask.toolCallId,
      });
      const input = parsed.value;
      run = (emit) => askReply.run(input, emit);
    } else {
      options.inspect?.({
        type: "request-start",
        requestId,
        conversationId: parsed.value.conversationId,
        userMessageId: parsed.value.userMessage.id,
      });
      const input = parsed.value;
      run = (emit) => options.runTurn(input, emit);
    }

    let messageId: string | undefined;
    const continuationMessageId =
      parsed.kind === "ask-reply" ? parsed.value.assistantMessageId : undefined;
    let terminalEventEmitted = false;
    const awaitingAskToolCallIds = new Set<string>();
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          await run((event) => {
            if (event.type === "response-start") messageId = event.messageId;
            // An ask suspends the turn for a human answer: its call goes to the
            // panel as an awaiting client tool, and the harness's own output
            // record (the minted affordance) never reaches the wire — the
            // registered component supplies the output when the person submits.
            if (
              event.type === "tool-input" &&
              event.toolName === ASK_TOOL_NAME
            ) {
              awaitingAskToolCallIds.add(event.toolCallId);
              writer.write({
                type: "tool-input-available",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                input: event.input,
              });
              const inspection = inspectionFor(event, requestId, messageId);
              if (inspection) options.inspect?.(inspection);
              return;
            }
            if (
              event.type === "tool-output" &&
              awaitingAskToolCallIds.has(event.toolCallId)
            ) {
              options.inspect?.({
                type: "ask-await",
                requestId,
                toolCallId: event.toolCallId,
              });
              return;
            }
            const wireEvent =
              event.type === "response-start" &&
              continuationMessageId !== undefined
                ? { ...event, messageId: continuationMessageId }
                : event;
            writer.write(toUiChunk(wireEvent));
            if (event.type === "response-finish") terminalEventEmitted = true;
            const inspection = inspectionFor(event, requestId, messageId);
            if (inspection) options.inspect?.(inspection);
          });
        } catch (error) {
          // Flue delivers a failed/aborted settlement to the projector and then
          // rejects read(). Once that terminal event is on the wire, the
          // rejection carries no new state and must not create a second ending.
          if (terminalEventEmitted) return;
          options.inspect?.({
            type: "request-finish",
            requestId,
            terminalState: "failed",
            finishReason: "error",
          });
          throw error;
        }
      },
      onError: () => "The elicitor turn failed.",
    });

    const response = createUIMessageStreamResponse({ stream });
    return crossOriginHeaders === undefined
      ? response
      : withHeaders(response, crossOriginHeaders);
  };
