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

/** Parse a delivered signal body; malformed bodies and members are dropped, never repaired. */
export const parseClientToolResults = (
  body: string,
): readonly ClientToolResult[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter(isClientToolResult) : [];
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
