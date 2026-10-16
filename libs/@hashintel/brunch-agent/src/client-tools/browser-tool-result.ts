/** A browser-executed result, exchanged in band with the server. */
export interface ClientToolResult {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: unknown;
  /** Host-owned verified sidecar; canonical output remains unchanged. */
  readonly metadata?: unknown;
}

/** How the server records a settled browser result as the tool's output in history. */
export type BrowserToolEnvelope = Pick<
  ClientToolResult,
  "output" | "metadata"
> & { readonly brunchBrowserResult: true };

/** The settled browser-tool envelope a recorded tool output holds, if it is one. */
export const browserToolEnvelopeOf = (
  value: unknown,
): BrowserToolEnvelope | undefined =>
  typeof value === "object" &&
  value !== null &&
  "brunchBrowserResult" in value &&
  value.brunchBrowserResult === true &&
  "output" in value
    ? {
        brunchBrowserResult: true,
        output: value.output,
        ...("metadata" in value ? { metadata: value.metadata } : {}),
      }
    : undefined;

/**
 * The browser's own output inside a settled browser-tool envelope; any other
 * tool output is returned unchanged.
 */
export const browserToolOutput = (output: unknown): unknown => {
  const envelope = browserToolEnvelopeOf(output);
  return envelope ? envelope.output : output;
};
