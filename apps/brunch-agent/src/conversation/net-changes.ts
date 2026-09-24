import { parseClientToolResultMetadata } from "@hashintel/brunch-agent-plugin-sdcpn";
import { MUTATE_WORKPIECE_TOOL_NAME } from "@hashintel/brunch-agent/flue";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { retainedSettledRevision } from "./workpiece.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { SDCPN } from "@hashintel/petrinaut-core";

export interface ArcElement {
  readonly transitionId: string;
  readonly arcDirection: "input" | "output";
  readonly placeId: string;
}

export interface NetElement {
  readonly kind: string;
  readonly id: string;
  readonly arc?: ArcElement;
}

export interface NetCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly revisionBefore?: string;
  readonly revisionAfter?: string;
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
            !(part.toolName in petrinautAiTools) ||
            part.state !== "output-available"
          )
            return [];
          const envelope = part.output;
          if (
            typeof envelope !== "object" ||
            envelope === null ||
            !("brunchBrowserResult" in envelope) ||
            envelope.brunchBrowserResult !== true
          )
            return [];
          if (!("output" in envelope)) return [];
          const metadata = parseClientToolResultMetadata(
            "metadata" in envelope ? envelope.metadata : undefined,
          );
          return [
            {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              output: envelope.output,
              revisionBefore: metadata?.documentRevision.before,
              revisionAfter: metadata?.documentRevision.after,
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

const hasId = (value: unknown, id: string): boolean => {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((item) => hasId(item, id));
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).some((item) => hasId(item, id))
  );
};

/** Arcs have no standalone ID: the canonical action identifies their transition, direction and endpoint. */
const matchesArc = (call: NetCall, arc: ArcElement): boolean => {
  if (
    ![
      "addArc",
      "removeArc",
      "updateArcWeight",
      "updateArcType",
      "updateArcPlace",
    ].includes(call.toolName)
  )
    return false;
  const input = call.input;
  if (typeof input !== "object" || input === null) return false;
  if (!("transitionId" in input) || input.transitionId !== arc.transitionId)
    return false;
  const direction = "arcDirection" in input ? input.arcDirection : "input";
  if (direction !== arc.arcDirection) return false;
  if (call.toolName === "updateArcPlace")
    return (
      ("newPlaceId" in input && input.newPlaceId === arc.placeId) ||
      ("newEndpoint" in input && hasId(input.newEndpoint, arc.placeId))
    );
  return (
    ("placeId" in input && input.placeId === arc.placeId) ||
    ("endpoint" in input && hasId(input.endpoint, arc.placeId))
  );
};

const targetsKind = (toolName: string, kind: string): boolean => {
  const token = kind.slice(0, 1).toUpperCase() + kind.slice(1);
  return toolName.includes(token) || toolName === "deleteItemsByIds";
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
        : targetsKind(call.toolName, element.kind) &&
          (hasId(call.input, element.id) || hasId(call.output, element.id))),
  );

export const latestSettledWorkpieceBefore = (
  snapshot: FlueConversationSnapshot,
  toolCallId: string,
) => {
  const position = snapshot.messages
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
  const message = position && snapshot.messages[position.messageIndex];
  if (!position || !message) return undefined;
  const prefix = {
    ...snapshot,
    messages: [
      ...snapshot.messages.slice(0, position.messageIndex),
      { ...message, parts: message.parts.slice(0, position.partIndex) },
    ],
  };
  const parts = prefix.messages.flatMap((entry) =>
    entry.role === "assistant" && entry.purpose === "assistant"
      ? entry.parts
      : [],
  );
  for (const part of parts.toReversed()) {
    if (
      part.type !== "dynamic-tool" ||
      part.toolName !== MUTATE_WORKPIECE_TOOL_NAME ||
      part.state !== "output-available"
    )
      continue;
    const revision = retainedSettledRevision(prefix, part.toolCallId);
    if (revision) return revision;
  }
  return undefined;
};

export const workpieceRevisionAtCall = (
  snapshot: FlueConversationSnapshot,
  call: NetCall,
) => latestSettledWorkpieceBefore(snapshot, call.toolCallId);

export const latestNetReadBefore = (
  snapshot: FlueConversationSnapshot,
  toolCallId: string,
): NetCall | undefined => {
  const calls = netCalls(snapshot);
  const position = snapshot.messages
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
  if (!position) return undefined;
  return calls.findLast(
    (call) =>
      call.toolName === "getLatestNetDefinition" &&
      (call.messageIndex < position.messageIndex ||
        (call.messageIndex === position.messageIndex &&
          call.partIndex < position.partIndex)),
  );
};

export const latestNetDefinition = (
  snapshot: FlueConversationSnapshot,
): { readonly definition: SDCPN; readonly call: NetCall } | undefined => {
  const call = netCalls(snapshot).findLast(
    (entry) => entry.toolName === "getLatestNetDefinition",
  );
  if (
    !call ||
    typeof call.output !== "object" ||
    call.output === null ||
    !("definition" in call.output)
  )
    return undefined;
  return { definition: call.output.definition as SDCPN, call };
};
