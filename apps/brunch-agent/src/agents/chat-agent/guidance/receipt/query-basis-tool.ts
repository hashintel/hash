import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { brunchTools } from "@hashintel/brunch-agent";
import { netElementKinds } from "@hashintel/brunch-agent-plugin-sdcpn";

import {
  callsForElement,
  isAppliedChange,
  latestNetDefinition,
  netCalls,
  type ArcElement,
  type NetCall,
} from "../../../../conversation/net-changes.ts";
import { reconstructLedger } from "./ledger.ts";
import description from "./query-basis-tool.md?raw";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent-plugin-sdcpn";
import type { SDCPN } from "@hashintel/petrinaut-core";

const elementSchema = v.object({
  selector: v.object({
    kind: v.picklist(netElementKinds),
    name: v.optional(v.string()),
    id: v.optional(v.string()),
    transitionId: v.optional(v.string()),
    arcDirection: v.optional(v.picklist(["input", "output"])),
    placeId: v.optional(v.string()),
  }),
});
type Selector = v.InferOutput<typeof elementSchema>["selector"];

const elements = (
  definition: SDCPN,
  kind: Selector["kind"],
): { id: string; name: string; arc?: ArcElement }[] => {
  if (kind === "place") return definition.places;
  if (kind === "transition") return definition.transitions;
  if (kind === "type") return definition.types;
  if (kind === "parameter") return definition.parameters;
  if (kind === "differentialEquation") return definition.differentialEquations;
  if (kind === "scenario") return definition.scenarios ?? [];
  if (kind === "metric") return definition.metrics ?? [];
  if (kind === "subnet") return definition.subnets ?? [];
  if (kind === "componentInstance") return definition.componentInstances ?? [];
  if (kind === "typeElement")
    return definition.types.flatMap((color) =>
      color.elements.map((element) => ({
        id: element.elementId,
        name: element.name,
      })),
    );
  // An arc is identified by its transition and endpoint, not a standalone ID.
  return definition.transitions.flatMap((transition) => {
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

/** This Ledger as it stood when a call was made, and the Notes its turn had recorded so far. */
const ledgerAtCall = (snapshot: FlueConversationSnapshot, call: NetCall) => {
  const message = snapshot.messages[call.messageIndex];
  if (!message) return undefined;
  const prefix = {
    messages: [
      ...snapshot.messages.slice(0, call.messageIndex),
      { ...message, parts: message.parts.slice(0, call.partIndex) },
    ],
  };
  const commits = reconstructLedger(prefix);
  const latest = commits.at(-1);
  const userMessageId = prefix.messages.findLast(
    (entry) => entry.role === "user" && entry.purpose === "user",
  )?.id;
  return {
    revision: latest?.revision ?? 0,
    notesThisTurn: commits
      .filter(({ afterMessageId }) => afterMessageId === userMessageId)
      .flatMap(({ notes }) => notes.map(({ id }) => id)),
  };
};

export const queryBasis = (input: {
  snapshot: FlueConversationSnapshot;
  browser: BrowserContext;
  query: Selector;
}) => {
  const latest = latestNetDefinition(input.snapshot);
  const read = latest?.call;
  if (
    read &&
    netCalls(input.snapshot).some(
      (call) =>
        isAppliedChange(call) &&
        (call.messageIndex > read.messageIndex ||
          (call.messageIndex === read.messageIndex &&
            call.partIndex > read.partIndex)),
    )
  )
    return {
      binding: input.browser.binding,
      disposition: "stale-read" as const,
      reason:
        "The net changed after the latest net read; read it again, then query.",
      target: undefined,
      readToolCallId: read.toolCallId,
      changes: [],
    };
  const candidates = latest
    ? elements(latest.definition, input.query.kind).filter(
        (element) =>
          (input.query.id !== undefined && element.id === input.query.id) ||
          (input.query.name !== undefined &&
            element.name === input.query.name) ||
          (input.query.kind === "arc" &&
            element.arc !== undefined &&
            input.query.transitionId === element.arc.transitionId &&
            input.query.arcDirection === element.arc.arcDirection &&
            input.query.placeId === element.arc.placeId),
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
          notesRecordedThisTurn: ledger?.notesThisTurn ?? [],
        };
      })
    : [];
  return {
    binding: input.browser.binding,
    disposition: target ? ("basis-absent" as const) : ("not-found" as const),
    reason: target
      ? "No declared basis exists; these are chronological call associations, not semantic justification."
      : "The named element is absent or ambiguous in the latest net read.",
    target,
    readToolCallId: latest?.call.toolCallId,
    changes,
  };
};

/** `query_basis` over the net's recorded changes and this arm's own Ledger. */
export const createQueryBasisTool = (options: {
  browser: BrowserContext;
  history: () => Promise<FlueConversationSnapshot>;
}) =>
  defineTool({
    name: brunchTools.queryBasis,
    description: description.trim(),
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
