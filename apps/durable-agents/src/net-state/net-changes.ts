/**
 * The net's recorded changes, from the conversation's browser-call records:
 * Brunch's `apps/brunch-agent/src/shared/conversation/net-changes.ts` with
 * the record by `toolCallId` in place of the settled tool part, and the
 * call's issue position (its assistant entry, then its index there) in place
 * of the message and part indexes. A change is attributed per canonical call
 * (`canonicalCallsOf`), as Brunch's is.
 */
import {
  type ArcElement,
  browserToolFacts,
  type CanonicalPetrinautCall,
  canonicalCallsOf,
  generatedArcId,
  namesId,
  type NetElementAddress,
  type NetStructure,
  parseClientToolResultMetadata,
} from "@hashintel/brunch-agent";

import { netResultView } from "./net-view";

import type { BrowserCallRecord } from "../browser-call/browser-call";

export type NetElement = NetElementAddress & { readonly arc?: ArcElement };

export type NetCall = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly revisionBefore?: string;
  readonly revisionAfter?: string;
  /** The browser's host-only metadata, as recorded. */
  readonly metadata: unknown;
  /** The `pi.assistant` entry that issued the call. */
  readonly issuedEntry: number;
  /** The call's index among that entry's tool calls. */
  readonly callIndex: number;
};

/** Whether `left` was issued before `right`. */
export const issuedBefore = (
  left: Pick<NetCall, "issuedEntry" | "callIndex">,
  right: Pick<NetCall, "issuedEntry" | "callIndex">,
) =>
  left.issuedEntry < right.issuedEntry ||
  (left.issuedEntry === right.issuedEntry && left.callIndex < right.callIndex);

/**
 * The browser's settled net calls, in issue order. A call recorded without
 * its issue position, before positions were recorded, is left out.
 */
export const netCalls = (
  calls: Readonly<Record<string, BrowserCallRecord>>,
): NetCall[] =>
  Object.values(calls)
    .flatMap((record) => {
      const { issuedEntry, callIndex } = record;
      if (
        record.status !== "settled" ||
        !browserToolFacts(record.toolName).runsOnNet ||
        issuedEntry === undefined ||
        callIndex === undefined
      )
        return [];
      const metadata = parseClientToolResultMetadata(record.metadata);
      return [
        {
          toolCallId: record.toolCallId,
          toolName: record.toolName,
          input: record.input,
          output: record.output,
          revisionBefore: metadata?.documentRevision.before,
          revisionAfter: metadata?.documentRevision.after,
          metadata: record.metadata,
          issuedEntry,
          callIndex,
        },
      ];
    })
    .toSorted((left, right) =>
      issuedBefore(left, right) ? -1 : issuedBefore(right, left) ? 1 : 0,
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

/**
 * Arcs have no standalone ID: the arc actions identify their transition,
 * direction and endpoint, and a batch deletion uses the generated arc ID.
 * Judged on each canonical call a call makes, so a merged arc update counts as
 * the calls it runs.
 */
const canonicalCallMatchesArc = (
  { toolName, input }: CanonicalPetrinautCall,
  arc: ArcElement,
): boolean => {
  if (toolName === "deleteItemsByIds") return hasId(input, generatedArcId(arc));
  if (!browserToolFacts(toolName).targets.includes("arc")) return false;
  if (typeof input !== "object" || input === null) return false;
  if (
    !("transitionId" in input) ||
    !namesId(input.transitionId, arc.transitionId)
  )
    return false;
  const direction = "arcDirection" in input ? input.arcDirection : "input";
  if (direction !== arc.arcDirection) return false;
  if (toolName === "updateArcPlace")
    return (
      ("newPlaceId" in input && namesId(input.newPlaceId, arc.placeId)) ||
      ("newEndpoint" in input && hasId(input.newEndpoint, arc.placeId))
    );
  return (
    ("placeId" in input && namesId(input.placeId, arc.placeId)) ||
    ("endpoint" in input && hasId(input.endpoint, arc.placeId))
  );
};

/**
 * The applied changes that touched an element, each judged on the canonical
 * calls it makes (`canonicalCallsOf`), so one of HASH's merged updates is
 * attributed to every element any of its operations touched. An ID in the
 * call's output still counts, for the element a creation produced.
 */
export const callsForElement = (
  calls: readonly NetCall[],
  element: NetElement,
): NetCall[] =>
  calls.filter((call) => {
    if (!isAppliedChange(call)) return false;
    const canonicalCalls = canonicalCallsOf(call.toolName, call.input);
    const { arc } = element;
    return arc
      ? canonicalCalls.some((canonical) =>
          canonicalCallMatchesArc(canonical, arc),
        )
      : canonicalCalls.some(
          (canonical) =>
            browserToolFacts(canonical.toolName).targets.includes(
              element.kind,
            ) &&
            (hasId(canonical.input, element.id) ||
              hasId(call.output, element.id)),
        );
  });

/**
 * The net as the latest result that shows it: a net read, or a change that
 * carries the net read back.
 */
export const latestNetDefinition = (
  calls: readonly NetCall[],
):
  | { readonly definition: NetStructure; readonly call: NetCall }
  | undefined => {
  const call = calls.findLast(
    (entry) => netResultView(entry.toolName, entry.metadata) !== undefined,
  );
  if (!call) return undefined;
  const view = netResultView(call.toolName, call.metadata);
  if (view?.kind === "change") return { definition: view.readBack, call };
  return typeof call.output === "object" &&
    call.output !== null &&
    "definition" in call.output
    ? { definition: call.output.definition as NetStructure, call }
    : undefined;
};
