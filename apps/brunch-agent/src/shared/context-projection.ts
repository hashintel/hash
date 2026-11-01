import {
  browserExecutedToolNames,
  browserToolEnvelopeOf,
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
} from "@hashintel/brunch-agent";

import { netResultView } from "./conversation/net-view.ts";

import type {
  ContextProjection,
  ContextProjectionEntry,
  ContextProjectionMessage,
} from "@flue/runtime";
import type { BrowserToolEnvelope } from "@hashintel/brunch-agent";

const browserEnvelope = (
  message: ContextProjectionMessage,
): BrowserToolEnvelope | undefined => {
  if (
    message.role !== "toolResult" ||
    message.isError ||
    !browserExecutedToolNames.has(message.toolName)
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
  return browserToolEnvelopeOf(envelope);
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
    const view = netResultView(message.toolName, envelope.metadata);
    if (view?.kind === "read") candidate = undefined;
    else if (view?.kind === "change") candidate = index;
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
  const view = withReadBack
    ? netResultView(entry.message.toolName, envelope.metadata)
    : undefined;
  const readBack = view?.kind === "change" ? view.readBack : undefined;
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

/**
 * Submission context is host data the agent reads from the delivery and
 * restates in its instructions. The model sees the body the turn would have
 * had without it: the user's text, or the diagnostics envelope.
 */
const withoutSubmissionContext = (text: string): string => {
  const body = parsePetrinautUserMessageBody(text);
  if (body.kind !== "contextual" || body.submissionContext === undefined)
    return text;
  return body.diagnosticsContext === ""
    ? body.userText
    : petrinautContextualUserMessageBody({
        userText: body.userText,
        diagnosticsContext: body.diagnosticsContext,
      });
};

const projectUserBody = (
  entry: ContextProjectionEntry,
): ContextProjectionEntry => {
  const message = entry.message;
  if (message.role !== "user") return entry;
  return {
    ...entry,
    message:
      typeof message.content === "string"
        ? { ...message, content: withoutSubmissionContext(message.content) }
        : {
            ...message,
            content: message.content.map((part) =>
              part.type === "text"
                ? { ...part, text: withoutSubmissionContext(part.text) }
                : part,
            ),
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
      entry.message.role === "user"
        ? projectUserBody(entry)
        : projectInBandBrowserResult(entry, entryIndex === readBackIndex),
    );
  };

export const projectBrunchContext = createBrunchContextProjection();
