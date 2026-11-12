import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import {
  basisQueryReasons,
  brunchTools,
  foldCommits,
  generatedArcId,
  namesId,
  queryBasisToolDescription,
  traceLedger,
  vBasisQueryInput,
} from "@hashintel/brunch-agent";

import {
  callsForElement,
  isAppliedChange,
  latestNetDefinition,
  netCalls,
  type NetCall,
  type NetElement,
} from "../../shared/conversation/net-changes.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type {
  ArcElement,
  BasisQuerySelector,
  BrowserContext,
  LedgerTrace,
  NetElementAddress,
  NetStructure,
} from "@hashintel/brunch-agent";

/** A net element the selector can match: by ID, by name, or by its arc's endpoints. */
type ElementCandidate = Omit<NetElement, "kind"> & { readonly name: string };

/** The root net and each subnet: places, transitions and their other items can sit in either. */
const netsOf = (definition: NetStructure) => [
  definition,
  ...(definition.subnets ?? []),
];

const elements = (
  definition: NetStructure,
  kind: BasisQuerySelector["kind"],
): ElementCandidate[] => {
  if (kind === "scenario") return definition.scenarios ?? [];
  if (kind === "metric") return definition.metrics ?? [];
  if (kind === "subnet") return definition.subnets ?? [];
  return netsOf(definition).flatMap((net) => netElements(net, kind));
};

const netElements = (
  net: ReturnType<typeof netsOf>[number],
  kind: Exclude<BasisQuerySelector["kind"], "scenario" | "metric" | "subnet">,
): ElementCandidate[] => {
  if (kind === "place") return net.places;
  if (kind === "transition") return net.transitions;
  if (kind === "type") return net.types;
  if (kind === "parameter") return net.parameters;
  if (kind === "differentialEquation") return net.differentialEquations;
  if (kind === "componentInstance") return net.componentInstances ?? [];
  if (kind === "typeElement")
    return net.types.flatMap((color) =>
      color.elements.map((element) => ({
        id: element.elementId,
        name: element.name,
      })),
    );
  // An arc is selected by its transition and endpoint, and identified by the ID Petrinaut generates from them.
  return net.transitions.flatMap((transition) => {
    const arcElements = (
      arcDirection: ArcElement["arcDirection"],
      arcs: readonly Pick<
        (typeof transition.inputArcs)[number],
        "endpoint" | "placeId"
      >[],
    ) =>
      arcs.map((arc) => {
        const placeId =
          arc.endpoint?.kind === "place"
            ? arc.endpoint.placeId
            : (arc.placeId ?? "");
        const element = { transitionId: transition.id, arcDirection, placeId };
        return {
          arc: element,
          id: generatedArcId(element),
          name: `${transition.name} ${arcDirection}`,
        };
      });
    return [
      ...arcElements("input", transition.inputArcs),
      ...arcElements("output", transition.outputArcs),
    ];
  });
};

/** A record as the model reads it: its ID and fields, with the turn it was recorded in. */
const recordContent = <Fields extends { address: string }>({
  address,
  ...fields
}: Fields) => ({ id: address, ...fields });

/** The trace as the model reads it: record IDs in place of addresses. */
const basisContent = (trace: LedgerTrace) => ({
  reflections: trace.reflections.map(recordContent),
  obligations: trace.obligations.map(recordContent),
  claims: trace.claims.map(recordContent),
  entities: trace.entities.map(recordContent),
  superseded: trace.superseded,
  turns: trace.turns,
});

/** Whether a reflection's net element address names the target, as the document or the model wrote it. */
const namesTarget =
  (kind: BasisQuerySelector["kind"], target: Omit<NetElement, "kind">) =>
  (address: NetElementAddress) =>
    address.kind === kind && namesId(address.id, target.id);

/** The Ledger revision current when a call was made. */
const ledgerRevisionAt = (
  snapshot: FlueConversationSnapshot,
  call: NetCall,
) => {
  const message = snapshot.messages[call.messageIndex];
  if (!message) return undefined;
  return foldCommits({
    messages: [
      ...snapshot.messages.slice(0, call.messageIndex),
      { ...message, parts: message.parts.slice(0, call.partIndex) },
    ],
  }).revision;
};

export const queryBasis = (input: {
  snapshot: FlueConversationSnapshot;
  browser: BrowserContext;
  query: BasisQuerySelector;
}) => {
  // The latest read, or the latest change carrying its read-back; a change
  // after it carried none.
  const latest = latestNetDefinition(input.snapshot);
  const view = latest?.call;
  if (
    view &&
    netCalls(input.snapshot).some(
      (call) =>
        isAppliedChange(call) &&
        (call.messageIndex > view.messageIndex ||
          (call.messageIndex === view.messageIndex &&
            call.partIndex > view.partIndex)),
    )
  )
    return {
      binding: input.browser.binding,
      disposition: "stale-read" as const,
      reason: basisQueryReasons["stale-read"],
      target: undefined,
      readToolCallId: view.toolCallId,
      basis: undefined,
      changes: [],
    };
  const candidates = latest
    ? elements(latest.definition, input.query.kind).filter(
        (element) =>
          namesId(input.query.id, element.id) ||
          (input.query.name !== undefined &&
            element.name === input.query.name) ||
          (input.query.kind === "arc" &&
            element.arc !== undefined &&
            namesId(input.query.transitionId, element.arc.transitionId) &&
            input.query.arcDirection === element.arc.arcDirection &&
            namesId(input.query.placeId, element.arc.placeId)),
      )
    : [];
  const target = candidates.length === 1 ? candidates.at(0) : undefined;
  if (!target)
    return {
      binding: input.browser.binding,
      disposition: "not-found" as const,
      reason: basisQueryReasons["not-found"],
      target,
      readToolCallId: latest?.call.toolCallId,
      basis: undefined,
      changes: [],
    };
  const changes = callsForElement(input.snapshot, {
    kind: input.query.kind,
    id: target.id,
    ...(target.arc === undefined ? {} : { arc: target.arc }),
  }).map((call) => ({
    toolCallId: call.toolCallId,
    operation: call.toolName,
    petrinautRevisionId: call.revisionAfter,
    ledgerRevision: ledgerRevisionAt(input.snapshot, call),
  }));
  const trace = traceLedger(foldCommits(input.snapshot).state, {
    netElement: namesTarget(input.query.kind, target),
  });
  const declared = trace.reflections.length > 0;
  return {
    binding: input.browser.binding,
    disposition: declared
      ? ("basis-declared" as const)
      : ("basis-absent" as const),
    reason: declared
      ? basisQueryReasons["basis-declared"]
      : basisQueryReasons["basis-absent"],
    target,
    readToolCallId: latest?.call.toolCallId,
    basis: declared ? basisContent(trace) : undefined,
    changes,
  };
};

/**
 * The basis query over the net's recorded changes and this agent's Ledger:
 * `query_basis` for the Petrinaut agent, `ledger_query_basis` for the HASH
 * agent.
 */
export const createQueryBasisTool = (options: {
  browser: BrowserContext;
  history: () => Promise<FlueConversationSnapshot>;
  name?: string;
}) =>
  defineTool({
    name: options.name ?? brunchTools.queryBasis,
    description: queryBasisToolDescription,
    input: vBasisQueryInput,
    output: v.custom<ReturnType<typeof queryBasis>>(() => true),
    async run({ data }) {
      return {
        output: queryBasis({
          snapshot: await options.history(),
          browser: options.browser,
          query: data.selector,
        }),
        terminate: false,
      };
    },
  });
