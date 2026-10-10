import {
  browserToolMutatesDocument,
  isNetObservationTool,
  parseClientToolResultMetadata,
} from "@hashintel/brunch-agent-plugin-sdcpn";

import { inBandBrowserToolNames } from "./tool-catalogue.ts";

import type {
  ContextProjection,
  ContextProjectionEntry,
  ContextProjectionMessage,
} from "@flue/runtime";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const browserEnvelope = (
  message: ContextProjectionMessage,
): Record<string, unknown> | undefined => {
  if (
    message.role !== "toolResult" ||
    message.isError ||
    !inBandBrowserToolNames.has(message.toolName)
  )
    return undefined;
  const text = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isRecord(envelope) &&
    envelope.brunchBrowserResult === true &&
    Object.hasOwn(envelope, "output")
    ? envelope
    : undefined;
};

/**
 * The latest document change carrying the browser's read-back, unless a later
 * net read already shows the model the net. Earlier read-backs stay host-only.
 */
const readBackEntryIndex = (
  entries: readonly ContextProjectionEntry[],
): number | undefined => {
  let candidate: number | undefined;
  for (const [index, { message }] of entries.entries()) {
    if (message.role !== "toolResult") continue;
    const envelope = browserEnvelope(message);
    if (!envelope) continue;
    if (isNetObservationTool(message.toolName)) candidate = undefined;
    else if (
      browserToolMutatesDocument(message.toolName) &&
      parseClientToolResultMetadata(envelope.metadata)?.readBack !== undefined
    )
      candidate = index;
  }
  return candidate;
};

/**
 * Flue retains the verified sidecar, but the provider sees only Petrinaut's
 * exact canonical result, plus the net's structure after the latest change.
 */
const projectInBandBrowserResult = (
  entry: ContextProjectionEntry,
  withReadBack: boolean,
): ContextProjectionEntry => {
  const envelope = browserEnvelope(entry.message);
  if (!envelope || entry.message.role !== "toolResult") return entry;
  const readBack = withReadBack
    ? parseClientToolResultMetadata(envelope.metadata)?.readBack
    : undefined;
  return {
    ...entry,
    message: {
      ...entry.message,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            readBack === undefined
              ? envelope.output
              : { output: envelope.output, netAfterChanges: readBack },
          ),
        },
      ],
    },
  };
};

export type BrunchContextProjectionOptions = {
  /** Receives exactly the canonical entries of the model's next request. */
  observe?: (entries: readonly ContextProjectionEntry[]) => void;
};

/**
 * Build Brunch's model-only projection. Every invocation decides from exactly
 * the entries it receives; canonical history is unchanged.
 */
export const createBrunchContextProjection =
  (options: BrunchContextProjectionOptions = {}): ContextProjection =>
  (entries) => {
    options.observe?.(entries);
    const readBackIndex = readBackEntryIndex(entries);
    return entries.map((entry, entryIndex) =>
      projectInBandBrowserResult(entry, entryIndex === readBackIndex),
    );
  };

export const projectBrunchContext = createBrunchContextProjection();
