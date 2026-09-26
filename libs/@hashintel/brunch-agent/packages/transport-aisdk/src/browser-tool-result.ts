/** Keep transient model context comfortably below Flue's delivered-message limit. */
export const CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH = 32_000;

/** A browser-executed result, exchanged in band with the server. */
export interface ClientToolResult {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: unknown;
  /** Host-owned verified sidecar; canonical output remains unchanged. */
  readonly metadata?: unknown;
}
