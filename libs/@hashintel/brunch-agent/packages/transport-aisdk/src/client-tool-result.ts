import { brunchSignals } from "@hashintel/brunch-agent/constants";

import type { DeliveredMessage } from "@flue/sdk";

/** Keep transient model context comfortably below Flue's delivered-message limit. */
export const CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH = 32_000;

/** One browser-executed tool result as delivered back to the agent. */
export interface ClientToolResult {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: unknown;
  /** Present when the call was spoken through Voice rather than the chat panel. */
  readonly source?: "voice";
  /** Host-owned verified sidecar; canonical output remains unchanged. */
  readonly metadata?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Structural check of one delivered result; `output` may hold any value, including `null`. */
export const isClientToolResult = (value: unknown): value is ClientToolResult =>
  isRecord(value) &&
  typeof value.toolCallId === "string" &&
  typeof value.toolName === "string" &&
  "output" in value &&
  (value.source === undefined || value.source === "voice");

/**
 * Why a delivered body lost members. Classification and counts only: the
 * body itself is caller content and never travels with the issue.
 */
export type ClientToolResultParseIssue =
  | { readonly kind: "invalid-json" }
  | { readonly kind: "not-array" }
  | { readonly kind: "invalid-context" }
  | {
      readonly kind: "dropped-members";
      readonly dropped: number;
      readonly total: number;
    };

export interface ClientToolResultPayload {
  readonly results: readonly ClientToolResult[];
  /** Transient context correlated with this result batch, not canonical tool output. */
  readonly context?: string;
}

const isBoundedContext = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  Array.from(value).length <= CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH;

/** Parse a delivered signal body, including its optional correlated context. */
export const parseClientToolResultPayload = (
  body: string,
  onIssue?: (issue: ClientToolResultParseIssue) => void,
): ClientToolResultPayload => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    onIssue?.({ kind: "invalid-json" });
    return { results: [] };
  }

  let members: unknown[];
  let context: string | undefined;
  if (Array.isArray(parsed)) {
    members = parsed;
  } else {
    const envelope = isRecord(parsed) ? parsed : null;
    if (!Array.isArray(envelope?.results)) {
      onIssue?.({ kind: "not-array" });
      return { results: [] };
    }
    if (!isBoundedContext(envelope.context)) {
      onIssue?.({ kind: "invalid-context" });
      return { results: [] };
    }
    members = envelope.results;
    context = envelope.context;
  }

  const results = members.filter(isClientToolResult);
  if (results.length !== members.length) {
    onIssue?.({
      kind: "dropped-members",
      dropped: members.length - results.length,
      total: members.length,
    });
  }
  return { results, ...(context === undefined ? {} : { context }) };
};

/** Parse results from either the original array wire shape or a contextual envelope. */
export const parseClientToolResults = (
  body: string,
  onIssue?: (issue: ClientToolResultParseIssue) => void,
): readonly ClientToolResult[] =>
  parseClientToolResultPayload(body, onIssue).results;

/** Require the protocol's machine identity and its model-visible rendering tag. */
export const isClientToolResultDelivery = (
  delivery: DeliveredMessage,
): delivery is Extract<DeliveredMessage, { kind: "signal" }> =>
  delivery.kind === "signal" &&
  delivery.type === brunchSignals.clientToolResult &&
  delivery.tagName === brunchSignals.clientToolResult;

/** The signal that carries completed client-tool results back into the conversation. */
export const clientToolResultSignal = (
  results: readonly ClientToolResult[],
  context?: string,
): Extract<DeliveredMessage, { kind: "signal" }> => {
  if (context !== undefined && !isBoundedContext(context)) {
    throw new Error("The client-tool result context is invalid or too long.");
  }
  const voiceToolCallIds = results
    .filter(({ source }) => source === "voice")
    .map(({ toolCallId }) => toolCallId);
  return {
    kind: "signal",
    type: brunchSignals.clientToolResult,
    tagName: brunchSignals.clientToolResult,
    body: JSON.stringify(
      context === undefined ? results : { results, context },
    ),
    attributes: {
      toolCallIds: results.map((result) => result.toolCallId).join(","),
      ...(voiceToolCallIds.length > 0
        ? { voiceToolCallIds: voiceToolCallIds.join(",") }
        : {}),
    },
  };
};
