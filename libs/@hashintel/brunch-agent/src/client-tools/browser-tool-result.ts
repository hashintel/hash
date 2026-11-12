import * as v from "valibot";
import { z } from "zod";

/**
 * `z.json()`, except that an object property may be `undefined`: what
 * `JSON.stringify` carries without loss, dropping only those properties.
 */
const zJsonLike: z.ZodType = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(zJsonLike),
    z.record(z.string(), zJsonLike.optional()),
  ]),
);
// Check without cloning or normalizing the result; typed as the JSON received.
const vJson = v.custom<z.infer<ReturnType<typeof z.json>>>(
  (value) => zJsonLike.safeParse(value).success,
  "Expected a JSON value",
);

/** The result boundary, before HTTP serialization and after receipt. */
export const vBrowserToolResult = v.object({
  output: vJson,
  /** Host-owned verified sidecar; canonical output remains unchanged. */
  metadata: v.optional(vJson),
});

/** A browser-executed result, exchanged in band with the server. */
export type ClientToolResult = Readonly<
  v.InferOutput<typeof vBrowserToolResult>
> & {
  readonly toolCallId: string;
  readonly toolName: string;
};

/** How the server records a settled browser result as the tool's output in history. */
export type BrowserToolEnvelope = Pick<
  ClientToolResult,
  "output" | "metadata"
> & { readonly brunchBrowserResult: true };

/** The settled browser-tool envelope a recorded tool output holds, if it is one. */
export const browserToolEnvelopeOf = (
  value: unknown,
): BrowserToolEnvelope | undefined => {
  if (
    !(
      typeof value === "object" &&
      value !== null &&
      "brunchBrowserResult" in value &&
      value.brunchBrowserResult === true &&
      "output" in value
    )
  )
    return undefined;
  const parsed = v.safeParse(vBrowserToolResult, value);
  return parsed.success
    ? { brunchBrowserResult: true, ...parsed.output }
    : undefined;
};

/**
 * The browser's own output inside a settled browser-tool envelope; any other
 * tool output is returned unchanged.
 */
export const browserToolOutput = (output: unknown): unknown => {
  const envelope = browserToolEnvelopeOf(output);
  return envelope ? envelope.output : output;
};
