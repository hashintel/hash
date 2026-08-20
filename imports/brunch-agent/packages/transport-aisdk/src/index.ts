/**
 * AI SDK transport for the harness reply protocol.
 *
 * This package owns only the UI-message-stream wire. An application supplies a
 * substrate-backed `runTurn`; the transport never imports a binding or Flue.
 */

import { type HarnessReplyEvent } from '@brunch/core';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageChunk } from 'ai';
import * as v from 'valibot';

export { type HarnessReplyEvent } from '@brunch/core';

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

export type TransportInspectionEvent =
  | {
      readonly type: 'request-start';
      readonly requestId: string;
      readonly conversationId: string;
      readonly userMessageId: string;
    }
  | {
      readonly type: 'response-start';
      readonly requestId: string;
      readonly messageId: string;
    }
  | {
      readonly type: 'turn-start';
      readonly requestId: string;
      readonly turnId: string;
      readonly messageId: string;
    }
  | {
      readonly type: 'part-emitted';
      readonly requestId: string;
      readonly kind: 'text' | 'reasoning' | 'tool-input' | 'tool-output';
      readonly partId?: string;
      readonly toolCallId?: string;
    }
  | {
      readonly type: 'turn-finish';
      readonly requestId: string;
      readonly turnId: string;
    }
  | {
      readonly type: 'request-finish';
      readonly requestId: string;
      readonly terminalState: 'completed' | 'failed' | 'aborted';
      readonly finishReason: 'stop' | 'tool-calls' | 'error';
    };

export interface AiSdkChatHandlerOptions {
  readonly runTurn: HarnessTurnRunner;
  /** Exact browser origins allowed to call this endpoint across origins. */
  readonly allowedOrigins?: readonly string[];
  /** Opt-in diagnostic sink. Events are metadata only and never re-enter the conversation. */
  readonly inspect?: (event: TransportInspectionEvent) => void;
}

const panelPartSchema = v.looseObject({
  type: v.optional(v.unknown()),
  text: v.optional(v.unknown()),
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
      readonly reason: 'invalid-chat-request';
      readonly status: 400;
      readonly error: 'invalid_chat_request';
    }
  | {
      readonly reason: 'tool-result-follow-up-not-supported';
      readonly status: 422;
      readonly error: 'tool_result_follow_up_not_supported';
    };

const transportRequestRefusals = {
  invalidChatRequest: {
    reason: 'invalid-chat-request',
    status: 400,
    error: 'invalid_chat_request',
  },
  toolResultFollowUpNotSupported: {
    reason: 'tool-result-follow-up-not-supported',
    status: 422,
    error: 'tool_result_follow_up_not_supported',
  },
} as const satisfies Record<string, TransportRequestRefusal>;

const jsonResponse = (body: unknown, status: number, headers?: Headers): Response =>
  Response.json(body, { status, headers });

const corsHeaders = (origin: string): Headers =>
  new Headers({
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-request-id',
    vary: 'Origin',
  });

const withHeaders = (response: Response, headers: Headers): Response => {
  for (const [name, value] of headers) response.headers.set(name, value);
  return response;
};

const userTextFrom = (message: PanelMessage): string | undefined => {
  if (!Array.isArray(message.parts)) return undefined;
  const text = message.parts
    .filter(
      (part): part is { readonly type: 'text'; readonly text: string } =>
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part &&
        typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('');
  return text.length > 0 ? text : undefined;
};

const parseInitialTurn = (
  body: PanelPostBody,
):
  | { readonly ok: true; readonly value: HarnessTurnInput }
  | { readonly ok: false; readonly refusal: TransportRequestRefusal } => {
  // The automatic tool-result follow-up is a machine-input protocol owned by
  // the later external-tool slice. Refuse it here instead of mistaking the
  // diagnostics decorator's synthetic user-role message for user evidence.
  if (body.messageId !== undefined) {
    return { ok: false, refusal: transportRequestRefusals.toolResultFollowUpNotSupported };
  }
  if (typeof body.id !== 'string' || body.id.length === 0 || body.trigger !== 'submit-message') {
    return { ok: false, refusal: transportRequestRefusals.invalidChatRequest };
  }
  if (!Array.isArray(body.messages)) {
    return { ok: false, refusal: transportRequestRefusals.invalidChatRequest };
  }

  const message = body.messages.at(-1) as PanelMessage | undefined;
  if (
    message?.role !== 'user' ||
    typeof message.id !== 'string' ||
    message.id.length === 0 ||
    message.id === 'petrinaut-diagnostics-context'
  ) {
    return { ok: false, refusal: transportRequestRefusals.invalidChatRequest };
  }
  const text = userTextFrom(message);
  if (text === undefined) {
    return { ok: false, refusal: transportRequestRefusals.invalidChatRequest };
  }

  return {
    ok: true,
    value: {
      conversationId: body.id,
      idempotencyKey: `${body.id}:${message.id}`,
      userMessage: { id: message.id, text },
    },
  };
};

const toUiChunk = (event: HarnessReplyEvent): UIMessageChunk => {
  switch (event.type) {
    case 'response-start':
      return { type: 'start', messageId: event.messageId };
    case 'turn-start':
      return { type: 'start-step' };
    case 'part-start':
      return { type: `${event.kind}-start`, id: event.partId };
    case 'part-delta':
      return { type: `${event.kind}-delta`, id: event.partId, delta: event.delta };
    case 'part-end':
      return { type: `${event.kind}-end`, id: event.partId };
    case 'tool-input':
      return {
        type: 'tool-input-available',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
        ...(event.execution === 'server' ? { providerExecuted: true } : {}),
      };
    case 'tool-output':
      return {
        type: 'tool-output-available',
        toolCallId: event.toolCallId,
        output: event.output,
        ...(event.execution === 'server' ? { providerExecuted: true } : {}),
      };
    case 'turn-finish':
      return { type: 'finish-step' };
    case 'response-finish':
      switch (event.terminalState) {
        case 'completed':
          return { type: 'finish', finishReason: event.finishReason };
        case 'failed':
          return { type: 'error', errorText: 'The elicitor turn failed.' };
        case 'aborted':
          return { type: 'abort', reason: 'Harness response aborted.' };
      }
  }
};

const inspectionFor = (
  event: HarnessReplyEvent,
  requestId: string,
  messageId: string | undefined,
): TransportInspectionEvent | undefined => {
  switch (event.type) {
    case 'response-start':
      return { type: 'response-start', requestId, messageId: event.messageId };
    case 'turn-start':
      return messageId === undefined
        ? undefined
        : { type: 'turn-start', requestId, turnId: event.turnId, messageId };
    case 'part-start':
      return { type: 'part-emitted', requestId, kind: event.kind, partId: event.partId };
    case 'tool-input':
      return {
        type: 'part-emitted',
        requestId,
        kind: 'tool-input',
        toolCallId: event.toolCallId,
      };
    case 'tool-output':
      return {
        type: 'part-emitted',
        requestId,
        kind: 'tool-output',
        toolCallId: event.toolCallId,
      };
    case 'turn-finish':
      return {
        type: 'turn-finish',
        requestId,
        turnId: event.turnId,
      };
    case 'response-finish':
      return {
        type: 'request-finish',
        requestId,
        terminalState: event.terminalState,
        finishReason: event.finishReason,
      };
    case 'part-delta':
    case 'part-end':
      return undefined;
  }
};

export const createAiSdkChatHandler =
  (options: AiSdkChatHandlerOptions) =>
  async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const crossOriginHeaders =
      origin !== null && options.allowedOrigins?.includes(origin) === true
        ? corsHeaders(origin)
        : undefined;
    if (origin !== null && crossOriginHeaders === undefined) {
      return jsonResponse({ error: 'origin_not_allowed' }, 403);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: crossOriginHeaders });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, crossOriginHeaders);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid_chat_request' }, 400, crossOriginHeaders);
    }
    const validatedBody = v.safeParse(panelPostBodySchema, body);
    if (!validatedBody.success) {
      const refusal = transportRequestRefusals.invalidChatRequest;
      return jsonResponse({ error: refusal.error }, refusal.status, crossOriginHeaders);
    }
    const parsed = parseInitialTurn(validatedBody.output);
    if (!parsed.ok) {
      return jsonResponse(
        { error: parsed.refusal.error },
        parsed.refusal.status,
        crossOriginHeaders,
      );
    }

    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    options.inspect?.({
      type: 'request-start',
      requestId,
      conversationId: parsed.value.conversationId,
      userMessageId: parsed.value.userMessage.id,
    });

    let messageId: string | undefined;
    let terminalEventEmitted = false;
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          await options.runTurn(parsed.value, (event) => {
            if (event.type === 'response-start') messageId = event.messageId;
            writer.write(toUiChunk(event));
            if (event.type === 'response-finish') terminalEventEmitted = true;
            const inspection = inspectionFor(event, requestId, messageId);
            if (inspection) options.inspect?.(inspection);
          });
        } catch (error) {
          // Flue delivers a failed/aborted settlement to the projector and then
          // rejects read(). Once that terminal event is on the wire, the
          // rejection carries no new state and must not create a second ending.
          if (terminalEventEmitted) return;
          options.inspect?.({
            type: 'request-finish',
            requestId,
            terminalState: 'failed',
            finishReason: 'error',
          });
          throw error;
        }
      },
      onError: () => 'The elicitor turn failed.',
    });

    const response = createUIMessageStreamResponse({ stream });
    return crossOriginHeaders === undefined ? response : withHeaders(response, crossOriginHeaders);
  };
