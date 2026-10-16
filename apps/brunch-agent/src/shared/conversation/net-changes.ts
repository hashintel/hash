import {
  type ArcElement,
  type NetElementAddress,
  browserNetToolNames,
  browserToolEnvelopeOf,
  generatedArcId,
  namesId,
  parseClientToolResultMetadata,
  petrinautToolTargets,
  type NetStructure,
} from "@hashintel/brunch-agent";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import { netResultView } from "./net-view.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { SDCPN } from "@hashintel/petrinaut-core";

export type NetElement = NetElementAddress & { readonly arc?: ArcElement };

export interface NetCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly revisionBefore?: string;
  readonly revisionAfter?: string;
  /** The browser's host-only metadata, as recorded. */
  readonly metadata: unknown;
  readonly messageIndex: number;
  readonly partIndex: number;
}

/** One chronological projection of the browser's settled results, without replay. */
export const netCalls = (snapshot: FlueConversationSnapshot): NetCall[] =>
  snapshot.messages.flatMap((message, messageIndex) =>
    message.role === "assistant" && message.purpose === "assistant"
      ? message.parts.flatMap((part, partIndex) => {
          if (
            part.type !== "dynamic-tool" ||
            !browserNetToolNames.has(part.toolName) ||
            part.state !== "output-available"
          )
            return [];
          const envelope = browserToolEnvelopeOf(part.output);
          if (!envelope) return [];
          const recordedMetadata = envelope.metadata;
          const metadata = parseClientToolResultMetadata(recordedMetadata);
          return [
            {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              output: envelope.output,
              revisionBefore: metadata?.documentRevision.before,
              revisionAfter: metadata?.documentRevision.after,
              metadata: recordedMetadata,
              messageIndex,
              partIndex,
            },
          ];
        })
      : [],
  );

export const isAppliedChange = (call: NetCall): boolean =>
  call.revisionAfter !== undefined &&
  !(
    typeof call.output === "object" &&
    call.output !== null &&
    "applied" in call.output &&
    call.output.applied === false
  );

/** Only values under an id key (`id` or `...Id`) are converted; names and code compare exactly. */
const hasId = (value: unknown, id: string, underIdKey = false): boolean => {
  if (underIdKey ? namesId(value, id) : value === id) return true;
  if (Array.isArray(value))
    return value.some((item) => hasId(item, id, underIdKey));
  return (
    typeof value === "object" &&
    value !== null &&
    Object.entries(value).some(([key, item]) =>
      hasId(item, id, key === "id" || key.endsWith("Id")),
    )
  );
};

/** Arcs have no standalone ID: the arc actions identify their transition, direction and endpoint, and a batch deletion uses the generated arc ID. */
const matchesArc = (call: NetCall, arc: ArcElement): boolean => {
  if (call.toolName === "deleteItemsByIds")
    return hasId(call.input, generatedArcId(arc));
  if (!petrinautToolTargets(call.toolName).includes("arc")) return false;
  const input = call.input;
  if (typeof input !== "object" || input === null) return false;
  if (
    !("transitionId" in input) ||
    !namesId(input.transitionId, arc.transitionId)
  )
    return false;
  const direction = "arcDirection" in input ? input.arcDirection : "input";
  if (direction !== arc.arcDirection) return false;
  if (call.toolName === "updateArcPlace")
    return (
      ("newPlaceId" in input && namesId(input.newPlaceId, arc.placeId)) ||
      ("newEndpoint" in input && hasId(input.newEndpoint, arc.placeId))
    );
  return (
    ("placeId" in input && namesId(input.placeId, arc.placeId)) ||
    ("endpoint" in input && hasId(input.endpoint, arc.placeId))
  );
};

export const callsForElement = (
  snapshot: FlueConversationSnapshot,
  element: NetElement,
): NetCall[] =>
  netCalls(snapshot).filter(
    (call) =>
      isAppliedChange(call) &&
      (element.arc
        ? matchesArc(call, element.arc)
        : petrinautToolTargets(call.toolName).includes(element.kind) &&
          (hasId(call.input, element.id) || hasId(call.output, element.id))),
  );

/** Where an assistant tool call sits in the conversation, by message and part index. */
const toolCallPosition = (
  snapshot: FlueConversationSnapshot,
  toolCallId: string,
) =>
  snapshot.messages
    .flatMap((message, messageIndex) =>
      message.role === "assistant" && message.purpose === "assistant"
        ? message.parts.flatMap((part, partIndex) =>
            part.type === "dynamic-tool" && part.toolCallId === toolCallId
              ? [{ messageIndex, partIndex }]
              : [],
          )
        : [],
    )
    .at(0);

/**
 * The `getLatestNetDefinition` read an experiment draft is prepared from. A
 * filtered reader does not count: the browser, the draft's tool description
 * and admission all require the complete definition.
 */
export const latestCanonicalNetReadBefore = (
  snapshot: FlueConversationSnapshot,
  toolCallId: string,
): NetCall | undefined => {
  const calls = netCalls(snapshot);
  const position = toolCallPosition(snapshot, toolCallId);
  if (!position) return undefined;
  return calls.findLast(
    (call) =>
      call.toolName === getLatestNetDefinitionToolName &&
      (call.messageIndex < position.messageIndex ||
        (call.messageIndex === position.messageIndex &&
          call.partIndex < position.partIndex)),
  );
};

/**
 * The net as the latest result that shows it: a net read, or a change that
 * carries the net read back.
 */
export const latestNetDefinition = (
  snapshot: FlueConversationSnapshot,
):
  | { readonly definition: NetStructure; readonly call: NetCall }
  | undefined => {
  const call = netCalls(snapshot).findLast(
    (entry) => netResultView(entry.toolName, entry.metadata) !== undefined,
  );
  if (!call) return undefined;
  const view = netResultView(call.toolName, call.metadata);
  if (view?.kind === "change") return { definition: view.readBack, call };
  return typeof call.output === "object" &&
    call.output !== null &&
    "definition" in call.output
    ? { definition: call.output.definition as SDCPN, call }
    : undefined;
};
