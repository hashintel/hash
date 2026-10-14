import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import {
  brunchTools,
  foldCommits,
  netElementKinds,
} from "@hashintel/brunch-agent";

import {
  callsForElement,
  isAppliedChange,
  latestNetDefinition,
  namesId,
  netCalls,
  type ArcElement,
  type NetCall,
} from "../../../shared/conversation/net-changes.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { BrowserContext, LedgerState } from "@hashintel/brunch-agent";
import type { SDCPN } from "@hashintel/petrinaut-core";

export const queryBasisToolDescription =
  "Use when the USER asks why a visible net element exists, instead of answering from memory. Finds the element in the latest net read, or in the net read back after a later change, and lists the canonical calls that changed it, each with its settled document revision, the Ledger revision current at the call, and the Ledger records committed in the same turn, before or after the call, each with its ID, record type and content, including the net element addresses a reflection concerns. These are chronological associations, not semantic justification: say so, and say plainly when no call is associated. A stale-read disposition means the net changed after the latest net view, a read or a change's read-back, without a later read-back: read it again, then query.";

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
          v.picklist(["input", "output"]),
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

/** The root net and each subnet: places, transitions and their other items can sit in either. */
const netsOf = (definition: SDCPN) => [
  definition,
  ...(definition.subnets ?? []),
];

const elements = (
  definition: SDCPN,
  kind: Selector["kind"],
): { id: string; name: string; arc?: ArcElement }[] => {
  if (kind === "scenario") return definition.scenarios ?? [];
  if (kind === "metric") return definition.metrics ?? [];
  if (kind === "subnet") return definition.subnets ?? [];
  return netsOf(definition).flatMap((net) => netElements(net, kind));
};

const netElements = (
  net: ReturnType<typeof netsOf>[number],
  kind: Exclude<Selector["kind"], "scenario" | "metric" | "subnet">,
): { id: string; name: string; arc?: ArcElement }[] => {
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
  // An arc is identified by its transition and endpoint, not a standalone ID.
  return net.transitions.flatMap((transition) => {
    const arcElements = (
      arcDirection: "input" | "output",
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
        return {
          arc: { transitionId: transition.id, arcDirection, placeId },
          id: `${transition.id}:${arcDirection}:${placeId}`,
          name: `${transition.name} ${arcDirection}`,
        };
      });
    return [
      ...arcElements("input", transition.inputArcs),
      ...arcElements("output", transition.outputArcs),
    ];
  });
};

/** A record as the model reads it: its ID and type with its fields, without the turn anchor. */
const recordContent = <
  Type extends string,
  Fields extends { address: string; turn: string },
>(
  type: Type,
  { address, turn: _turn, ...fields }: Fields,
) => ({ id: address, type, ...fields });

const findRecord = (state: LedgerState, id: string) => {
  const entity = state.entities.find(({ address }) => address === id);
  if (entity) return recordContent("entity", entity);
  const claim = state.claims.find(({ address }) => address === id);
  if (claim) return recordContent("claim", claim);
  const reflection = state.reflections.find(({ address }) => address === id);
  if (reflection) return recordContent("reflection", reflection);
  const obligation = state.obligations.find(({ address }) => address === id);
  if (obligation) return recordContent("obligation", obligation);
  return undefined;
};

const isUserMessage = (message: FlueConversationSnapshot["messages"][number]) =>
  message.role === "user" && message.purpose === "user";

/**
 * The Ledger revision current when a call was made, and every record its turn
 * committed, before or after the call: the guidance commits a change's
 * reflections after the change, in the same turn.
 */
const ledgerAtCall = (snapshot: FlueConversationSnapshot, call: NetCall) => {
  const message = snapshot.messages[call.messageIndex];
  if (!message) return undefined;
  const { revision } = foldCommits({
    messages: [
      ...snapshot.messages.slice(0, call.messageIndex),
      { ...message, parts: message.parts.slice(0, call.partIndex) },
    ],
  });
  const turnId = snapshot.messages
    .slice(0, call.messageIndex)
    .findLast(isUserMessage)?.id;
  const nextTurn = snapshot.messages.findIndex(
    (entry, index) => index > call.messageIndex && isUserMessage(entry),
  );
  const { state, commits } = foldCommits({
    messages: snapshot.messages.slice(
      0,
      nextTurn === -1 ? undefined : nextTurn,
    ),
  });
  const idsThisTurn = new Set(
    commits
      .filter(({ afterMessageId }) => afterMessageId === turnId)
      .flatMap(({ ids }) => ids),
  );
  return {
    revision,
    recordsThisTurn: [...idsThisTurn].flatMap(
      (id) => findRecord(state, id) ?? [],
    ),
  };
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
  const changes = target
    ? callsForElement(input.snapshot, {
        kind: input.query.kind,
        id: target.id,
        ...(target.arc === undefined ? {} : { arc: target.arc }),
      }).map((call) => {
        const ledger = ledgerAtCall(input.snapshot, call);
        return {
          toolCallId: call.toolCallId,
          operation: call.toolName,
          petrinautRevisionId: call.revisionAfter,
          ledgerRevision: ledger?.revision,
          recordsCommittedThisTurn: ledger?.recordsThisTurn ?? [],
        };
      })
    : [];
  return {
    binding: input.browser.binding,
    disposition: target ? ("basis-absent" as const) : ("not-found" as const),
    reason: target
      ? "No declared basis exists; these are chronological call associations, not semantic justification."
      : "The named element is absent or ambiguous in the latest net view.",
    target,
    readToolCallId: latest?.call.toolCallId,
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
