/**
 * The net's recorded changes and views, over calls each runtime projects from
 * its own history: Brunch's settled Flue tool parts, durable's browser-call
 * records. What a result shows of the net, which calls changed it, which
 * changed an element, and the net as the latest result shows it.
 */

import { mayShowNet, browserToolFacts } from "./browser-executed-tools";
import { parseClientToolResultMetadata } from "./browser-metadata";
import { generatedArcId, namesId, type ArcElement } from "./net-element-ids";
import { recordedCanonicalCallsOf } from "./recorded-calls";

import type { NetElementAddress } from "../ledger/construction/reflections";
import type { CanonicalPetrinautCall } from "./browser-executed-tools";
import type { NetStructure } from "./net-readers";

export type NetElement = NetElementAddress & { readonly arc?: ArcElement };

/**
 * A browser call's settled result on the net, without its position in the
 * history it was projected from. Each runtime extends it with that position.
 */
export interface NetCallCore {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly revisionBefore?: string;
  readonly revisionAfter?: string;
  /** The browser's host-only metadata, as recorded. */
  readonly metadata: unknown;
}

export type NetResultView =
  | {
      readonly kind: "read";
      /** The revision the read observed, when the browser reported one. */
      readonly revision: string | undefined;
    }
  | {
      readonly kind: "change";
      /** The revision the change produced. */
      readonly revision: string;
      /** The net's structure after the change. */
      readonly readBack: NetStructure;
    };

/**
 * What a successful browser result shows of the net, by the one rule
 * (`mayShowNet`): a read shows it at the revision it observed; a change shows
 * it only when it changed the document and carries the read-back. Anything
 * else shows nothing.
 */
export const netResultView = (
  toolName: string,
  metadata: unknown,
): NetResultView | undefined => {
  if (!mayShowNet(toolName)) return undefined;
  const parsed = parseClientToolResultMetadata(metadata);
  if (browserToolFacts(toolName).observesNet)
    return { kind: "read", revision: parsed?.documentRevision.before };
  const revision = parsed?.documentRevision.after;
  const readBack = parsed?.readBack;
  return revision === undefined || readBack === undefined
    ? undefined
    : { kind: "change", revision, readBack };
};

export const isAppliedChange = (call: NetCallCore): boolean =>
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
 * calls it makes (`recordedCanonicalCallsOf`), so one of HASH's merged updates
 * is attributed to every element any of its operations touched. An ID in the
 * call's output still counts, for the element a creation produced.
 */
export const callsForElement = <Call extends NetCallCore>(
  calls: readonly Call[],
  element: NetElement,
): Call[] =>
  calls.filter((call) => {
    if (!isAppliedChange(call)) return false;
    // A recorded call that no tool of today takes yields no canonical call,
    // and so is credited to no element.
    const canonicalCalls = recordedCanonicalCallsOf(call.toolName, call.input);
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
export const latestNetDefinition = <Call extends NetCallCore>(
  calls: readonly Call[],
):
  | {
      readonly definition: NetStructure;
      readonly call: Call;
      readonly revision: string | undefined;
    }
  | undefined => {
  const call = calls.findLast(
    (entry) => netResultView(entry.toolName, entry.metadata) !== undefined,
  );
  if (!call) return undefined;
  const view = netResultView(call.toolName, call.metadata);
  if (view === undefined) return undefined;
  const { revision } = view;
  if (view.kind === "change")
    return { definition: view.readBack, call, revision };
  return typeof call.output === "object" &&
    call.output !== null &&
    "definition" in call.output
    ? { definition: call.output.definition as NetStructure, call, revision }
    : undefined;
};
