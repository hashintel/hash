/**
 * AI SDK UI-message-stream transport for a Flue-backed chat.
 *
 * This package owns the HTTP door: principal, CORS, POST validation, and SSE
 * encoding. An application supplies the Flue turn. The transport never imports
 * Brunch core, a binding, or Flue.
 */

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageChunk,
} from "ai";
import * as v from "valibot";

import { BRUNCH_PRINCIPAL_HEADER } from "./headers";

export { BRUNCH_PRINCIPAL_HEADER } from "./headers";

export interface ChatTurnInput {
  readonly conversationId: string;
  readonly idempotencyKey: string;
  readonly principalKey: string;
  readonly userMessage: {
    readonly id: string;
    readonly text: string;
  };
}

export interface ClientToolResult {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: unknown;
}

export interface ChatResumeInput {
  readonly conversationId: string;
  readonly assistantMessageId: string;
  readonly idempotencyKey: string;
  readonly principalKey: string;
  readonly toolResults: readonly ClientToolResult[];
}

export type ChatChunkWriter = (chunk: UIMessageChunk) => void;

export type ChatTurnRunner = (
  input: ChatTurnInput,
  write: ChatChunkWriter,
) => Promise<void>;

export type ChatResumeRunner = (
  input: ChatResumeInput,
  write: ChatChunkWriter,
) => Promise<void>;

export type TransportInspectionEvent =
  | {
      readonly type: "request-start";
      readonly requestId: string;
      readonly conversationId: string;
      readonly userMessageId: string;
    }
  | {
      readonly type: "resume-start";
      readonly requestId: string;
      readonly conversationId: string;
      readonly assistantMessageId: string;
      readonly toolCallIds: readonly string[];
    }
  | {
      readonly type: "history-read";
      readonly requestId: string;
      readonly conversationId: string;
    }
  | {
      readonly type: "request-finish";
      readonly requestId: string;
      readonly terminal: "completed" | "failed";
    };

export interface AiSdkChatHandlerOptions {
  readonly runTurn: ChatTurnRunner;
  /**
   * Client-tool return. Absent, a tool-result follow-up is refused. Present,
   * completed client-tool parts on the referenced assistant message resume
   * the same conversation.
   */
  readonly resumeTurn?: ChatResumeRunner;
  /** Snapshot used to hydrate the panel from Flue history after reload. */
  readonly loadHistory?: (input: {
    readonly conversationId: string;
    readonly principalKey: string;
  }) => Promise<{ readonly messages: readonly unknown[] }>;
  readonly allowedOrigins?: readonly string[];
  readonly inspect?: (event: TransportInspectionEvent) => void;
}

const panelPartSchema = v.looseObject({
  type: v.optional(v.unknown()),
  text: v.optional(v.unknown()),
  toolName: v.optional(v.unknown()),
  toolCallId: v.optional(v.unknown()),
  state: v.optional(v.unknown()),
  output: v.optional(v.unknown()),
  providerExecuted: v.optional(v.unknown()),
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
type PanelPart = NonNullable<PanelMessage["parts"]>[number];

const transportRequestRefusals = {
  invalidChatRequest: {
    status: 400,
    error: "invalid_chat_request",
  },
  invalidPrincipal: {
    status: 400,
    error: "invalid_principal",
  },
  toolResultFollowUpNotSupported: {
    status: 422,
    error: "tool_result_follow_up_not_supported",
  },
} as const;

type TransportRequestRefusal =
  (typeof transportRequestRefusals)[keyof typeof transportRequestRefusals];

const jsonResponse = (
  body: unknown,
  status: number,
  headers?: Headers,
): Response => Response.json(body, { status, headers });

const corsHeaders = (origin: string): Headers =>
  new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": `content-type, x-request-id, ${BRUNCH_PRINCIPAL_HEADER}`,
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

const toolNameFrom = (part: PanelPart): string | undefined => {
  if (part.type === "dynamic-tool" && typeof part.toolName === "string") {
    return part.toolName.length > 0 ? part.toolName : undefined;
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    const toolName = part.type.slice("tool-".length);
    return toolName.length > 0 ? toolName : undefined;
  }
  return undefined;
};

const isCompletedClientToolPart = (part: PanelPart): boolean =>
  part.state === "output-available" &&
  part.providerExecuted !== true &&
  typeof part.toolCallId === "string" &&
  part.toolCallId.length > 0 &&
  toolNameFrom(part) !== undefined;

type ParsedTransportRequest =
  | { readonly kind: "initial"; readonly value: ChatTurnInput }
  | { readonly kind: "resume"; readonly value: ChatResumeInput }
  | { readonly kind: "refused"; readonly refusal: TransportRequestRefusal };

const parseResumeTurn = (
  body: PanelPostBody,
  principalKey: string,
): ParsedTransportRequest => {
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

  const assistantMessage = body.messages.find(
    (candidate) =>
      candidate.id === body.messageId && candidate.role === "assistant",
  );
  const toolResults = (assistantMessage?.parts ?? [])
    .filter(isCompletedClientToolPart)
    .map((part) => ({
      toolCallId: part.toolCallId as string,
      toolName: toolNameFrom(part)!,
      output: part.output,
    }));
  if (toolResults.length === 0) {
    return {
      kind: "refused",
      refusal: transportRequestRefusals.toolResultFollowUpNotSupported,
    };
  }

  return {
    kind: "resume",
    value: {
      conversationId: body.id,
      assistantMessageId: body.messageId,
      idempotencyKey: `${body.id}:tools:${toolResults
        .map((result) => result.toolCallId)
        .join(",")}`,
      principalKey,
      toolResults,
    },
  };
};

const parseInitialTurn = (
  body: PanelPostBody,
  principalKey: string,
): ParsedTransportRequest => {
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
      principalKey,
      userMessage: { id: message.id, text },
    },
  };
};

const readPrincipal = (request: Request): string | TransportRequestRefusal => {
  const principalKey = request.headers.get(BRUNCH_PRINCIPAL_HEADER)?.trim();
  if (
    principalKey === undefined ||
    principalKey.length === 0 ||
    principalKey.length > 256
  ) {
    return transportRequestRefusals.invalidPrincipal;
  }
  return principalKey;
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

    const principal = readPrincipal(request);
    if (typeof principal !== "string") {
      return jsonResponse(
        { error: principal.error },
        principal.status,
        crossOriginHeaders,
      );
    }

    if (request.method === "GET") {
      const conversationId = new URL(request.url).searchParams
        .get("id")
        ?.trim();
      if (conversationId === undefined || conversationId.length === 0) {
        return jsonResponse(
          { error: transportRequestRefusals.invalidChatRequest.error },
          transportRequestRefusals.invalidChatRequest.status,
          crossOriginHeaders,
        );
      }
      if (options.loadHistory === undefined) {
        return jsonResponse(
          { error: "method_not_allowed" },
          405,
          crossOriginHeaders,
        );
      }
      const requestId =
        request.headers.get("x-request-id") || crypto.randomUUID();
      options.inspect?.({
        type: "history-read",
        requestId,
        conversationId,
      });
      const history = await options.loadHistory({
        conversationId,
        principalKey: principal,
      });
      return jsonResponse(history, 200, crossOriginHeaders);
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
    const parsed =
      postBody.messageId !== undefined && options.resumeTurn !== undefined
        ? parseResumeTurn(postBody, principal)
        : postBody.messageId !== undefined
          ? ({
              kind: "refused",
              refusal: transportRequestRefusals.toolResultFollowUpNotSupported,
            } as const)
          : parseInitialTurn(postBody, principal);
    if (parsed.kind === "refused") {
      return jsonResponse(
        { error: parsed.refusal.error },
        parsed.refusal.status,
        crossOriginHeaders,
      );
    }

    const requestId =
      request.headers.get("x-request-id") || crypto.randomUUID();
    const continuationMessageId =
      parsed.kind === "resume" ? parsed.value.assistantMessageId : undefined;

    if (parsed.kind === "resume") {
      options.inspect?.({
        type: "resume-start",
        requestId,
        conversationId: parsed.value.conversationId,
        assistantMessageId: parsed.value.assistantMessageId,
        toolCallIds: parsed.value.toolResults.map(
          (result) => result.toolCallId,
        ),
      });
    } else {
      options.inspect?.({
        type: "request-start",
        requestId,
        conversationId: parsed.value.conversationId,
        userMessageId: parsed.value.userMessage.id,
      });
    }

    const run =
      parsed.kind === "resume"
        ? (write: ChatChunkWriter) => options.resumeTurn!(parsed.value, write)
        : (write: ChatChunkWriter) => options.runTurn(parsed.value, write);

    let terminalEmitted = false;
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          await run((chunk) => {
            if (chunk.type === "start" && continuationMessageId !== undefined) {
              writer.write({ ...chunk, messageId: continuationMessageId });
            } else {
              writer.write(chunk);
            }
            if (
              chunk.type === "finish" ||
              chunk.type === "error" ||
              chunk.type === "abort"
            ) {
              terminalEmitted = true;
            }
          });
          options.inspect?.({
            type: "request-finish",
            requestId,
            terminal: "completed",
          });
        } catch (error) {
          if (terminalEmitted) return;
          options.inspect?.({
            type: "request-finish",
            requestId,
            terminal: "failed",
          });
          throw error;
        }
      },
      onError: () => "The chat turn failed.",
    });

    const response = createUIMessageStreamResponse({ stream });
    return crossOriginHeaders === undefined
      ? response
      : withHeaders(response, crossOriginHeaders);
  };
