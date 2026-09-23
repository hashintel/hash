import type { DeliveredMessage } from "@flue/sdk";

/** Signal type and tag under which completed browser results return to the agent. */
export const CLIENT_TOOL_RESULT_SIGNAL = "client-tool-result";

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
  | {
      readonly kind: "dropped-members";
      readonly dropped: number;
      readonly total: number;
    };

/** Parse a delivered signal body; malformed bodies and members are dropped, never repaired. */
export const parseClientToolResults = (
  body: string,
  onIssue?: (issue: ClientToolResultParseIssue) => void,
): readonly ClientToolResult[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    onIssue?.({ kind: "invalid-json" });
    return [];
  }
  if (!Array.isArray(parsed)) {
    onIssue?.({ kind: "not-array" });
    return [];
  }
  const results = parsed.filter(isClientToolResult);
  if (results.length !== parsed.length) {
    onIssue?.({
      kind: "dropped-members",
      dropped: parsed.length - results.length,
      total: parsed.length,
    });
  }
  return results;
};

/** Require the protocol's machine identity and its model-visible rendering tag. */
export const isClientToolResultDelivery = (
  delivery: DeliveredMessage,
): delivery is Extract<DeliveredMessage, { kind: "signal" }> =>
  delivery.kind === "signal" &&
  delivery.type === CLIENT_TOOL_RESULT_SIGNAL &&
  delivery.tagName === CLIENT_TOOL_RESULT_SIGNAL;

/** The signal that carries completed client-tool results back into the conversation. */
export const clientToolResultSignal = (
  results: readonly ClientToolResult[],
): Extract<DeliveredMessage, { kind: "signal" }> => {
  const voiceToolCallIds = results
    .filter(({ source }) => source === "voice")
    .map(({ toolCallId }) => toolCallId);
  return {
    kind: "signal",
    type: CLIENT_TOOL_RESULT_SIGNAL,
    tagName: CLIENT_TOOL_RESULT_SIGNAL,
    body: JSON.stringify(results),
    attributes: {
      toolCallIds: results.map((result) => result.toolCallId).join(","),
      ...(voiceToolCallIds.length > 0
        ? { voiceToolCallIds: voiceToolCallIds.join(",") }
        : {}),
    },
  };
};
