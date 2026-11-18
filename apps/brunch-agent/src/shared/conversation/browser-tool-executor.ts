import type { JsonValue } from "@flue/runtime";
import type {
  BrowserToolEnvelope,
  ClientToolResult,
} from "@hashintel/brunch-agent";

/** What the bound browser settles a call with, without its correlation. */
type BrowserToolResult = Pick<ClientToolResult, "output" | "metadata">;

/** Issues one call to the bound browser and resolves with its settled result. */
export type BrowserToolExecutor = (call: {
  readonly toolName: string;
  readonly input: unknown;
  readonly toolCallId: string;
  readonly signal?: AbortSignal;
}) => Promise<BrowserToolResult>;

/** The browser's output goes to the model; the envelope and its metadata stay host-only. */
export const browserResultEnvelope = (result: BrowserToolResult) =>
  ({
    brunchBrowserResult: true,
    output: result.output,
    ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
  }) satisfies BrowserToolEnvelope & JsonValue;
