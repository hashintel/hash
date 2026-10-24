import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import {
  arcDirections,
  brunchTools,
  foldCommits,
  generatedArcId,
  namesId,
  netElementKinds,
  traceLedger,
} from "@hashintel/brunch-agent";

import {
  callsForElement,
  isAppliedChange,
  latestNetDefinition,
  netCalls,
  type NetCall,
  type NetElement,
} from "../../../shared/conversation/net-changes.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type {
  ArcElement,
  BrowserContext,
  LedgerTrace,
  NetElementAddress,
  NetStructure,
} from "@hashintel/brunch-agent";

export const queryBasisToolDescription =
  "Use when the USER asks why a visible net element exists or is modelled as it is, instead of answering from memory. Finds the element in the latest net read, or in the net read back after a later change, and returns its recorded basis: the reflections that name the element and, behind them, the claims, entities and discharged obligations they rest on, each with its ID, and the conversation turns those records came from, each with its ID and the opening of the USER's words. Answer from that basis and cite its record IDs. Cite every returned turn too, by quoting the opening of the USER's words, never by its ID, so the USER can see what they said that the answer rests on. A claim under `superseded` was later replaced: say so, and give its replacement. It also lists the canonical calls that changed the element, with their document and Ledger revisions. A basis-absent disposition means no reflection names the element: say plainly that its basis was not recorded rather than reconstructing one. You may point to related records, but do not offer a rationale of your own for it. A stale-read disposition means the net changed after the latest net view, a read or a change's read-back, without a later read-back: read it again, then query.";

const elementSchema = v.object({
  selector: v.pipe(
    v.object({
      kind: v.picklist(netElementKinds),
      name: v.optional(
        v.pipe(
          v.string(),
          v.description("The element's recorded name, unique within its kind."),
        ),
      ),
      id: v.optional(v.pipe(v.string(), v.description("The element's ID."))),
      transitionId: v.optional(
        v.pipe(v.string(), v.description("For an arc: its transition's ID.")),
      ),
      arcDirection: v.optional(
        v.pipe(
          v.picklist(arcDirections),
          v.description(
            "For an arc: its direction relative to the transition.",
          ),
        ),
      ),
      placeId: v.optional(
        v.pipe(v.string(), v.description("For an arc: its place's ID.")),
      ),
    }),
    v.description(
      "One element by kind and its name or ID; an arc by transitionId, arcDirection and placeId.",
    ),
  ),
});
type Selector = v.InferOutput<typeof elementSchema>["selector"];

/** A net element the selector can match: by ID, by name, or by its arc's endpoints. */
type ElementCandidate = Omit<NetElement, "kind"> & { readonly name: string };

/** The root net and each subnet: places, transitions and their other items can sit in either. */
const netsOf = (definition: NetStructure) => [
  definition,
  ...(definition.subnets ?? []),
];

const elements = (
  definition: NetStructure,
  kind: Selector["kind"],
): ElementCandidate[] => {
  if (kind === "scenario") return definition.scenarios ?? [];
  if (kind === "metric") return definition.metrics ?? [];
  if (kind === "subnet") return definition.subnets ?? [];
  return netsOf(definition).flatMap((net) => netElements(net, kind));
};

const netElements = (
  net: ReturnType<typeof netsOf>[number],
  kind: Exclude<Selector["kind"], "scenario" | "metric" | "subnet">,
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
  (kind: Selector["kind"], target: Omit<NetElement, "kind">) =>
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
  query: Selector;
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
      reason:
        "The net changed after the latest net view without a subsequent read-back; read it again, then query.",
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
      reason:
        "The named element is absent or ambiguous in the latest net view.",
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
      ? "Reflections name this element; the basis is what they rest on."
      : "No reflection names this element, so its basis was not recorded.",
    target,
    readToolCallId: latest?.call.toolCallId,
    basis: declared ? basisContent(trace) : undefined,
    changes,
  };
};

/** `query_basis` over the net's recorded changes and this agent's Ledger. */
export const createQueryBasisTool = (options: {
  browser: BrowserContext;
  history: () => Promise<FlueConversationSnapshot>;
}) =>
  defineTool({
    name: brunchTools.queryBasis,
    description: queryBasisToolDescription,
    input: elementSchema,
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
