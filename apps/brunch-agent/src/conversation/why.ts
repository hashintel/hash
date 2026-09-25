import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  callsForElement,
  latestNetDefinition,
  workpieceRevisionAtCall,
  type ArcElement,
} from "./net-changes.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent-plugin-sdcpn";
import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";
import type { SDCPN } from "@hashintel/petrinaut-core";

const elementSchema = v.object({
  selector: v.object({
    kind: v.picklist([
      "place",
      "transition",
      "arc",
      "type",
      "typeElement",
      "parameter",
      "differentialEquation",
      "scenario",
      "metric",
      "subnet",
      "componentInstance",
    ]),
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

const revisionTurnRange = (
  snapshot: FlueConversationSnapshot,
  revisionId: string,
) => {
  let turn = 0;
  let startTurn = 1;
  let userMessageIds: string[] = [];
  for (const message of snapshot.messages) {
    if (message.role === "user" && message.purpose === "user") {
      turn += 1;
      userMessageIds.push(message.id);
    }
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    if (
      message.parts.some(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolName === brunchTools.mutateWorkpiece &&
          part.state === "output-available" &&
          part.toolCallId === revisionId,
      )
    )
      return { revisionId, startTurn, endTurn: turn, userMessageIds };
    if (
      message.parts.some(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolName === brunchTools.mutateWorkpiece &&
          part.state === "output-available",
      )
    ) {
      startTurn = turn + 1;
      userMessageIds = [];
    }
  }
  return undefined;
};

export const queryWorkpiece = (input: {
  snapshot: FlueConversationSnapshot;
  current: WorkpieceRevision | null;
  browser: BrowserContext;
  query: Selector;
}) => {
  const latest = latestNetDefinition(input.snapshot);
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
        const revision = workpieceRevisionAtCall(input.snapshot, call);
        return {
          toolCallId: call.toolCallId,
          operation: call.toolName,
          petrinautRevisionId: call.revisionAfter,
          workpieceRevisionId: revision?.revisionId,
          workpieceRevisionTurns: revision
            ? revisionTurnRange(input.snapshot, revision.revisionId)
            : undefined,
        };
      })
    : [];
  return {
    binding: input.browser.binding,
    currentWorkpiece: input.current,
    disposition: target ? ("basis-absent" as const) : ("not-found" as const),
    reason: target
      ? "No declared basis exists in integrated mode; these are chronological call associations, not semantic justification."
      : "The named element is absent or ambiguous in the latest net read.",
    target,
    readToolCallId: latest?.call.toolCallId,
    changes,
  };
};

export const createQueryWorkpieceTool = (options: {
  current: WorkpieceRevision | null;
  browser: BrowserContext;
  history: () => Promise<FlueConversationSnapshot>;
}) =>
  defineTool({
    name: brunchTools.queryWorkpiece,
    description:
      "Find an element in the latest getLatestNetDefinition result by kind and unique name or ID; for an arc use its transitionId, arcDirection (input/output) and placeId. List canonical calls associated with that element, including their settled document revision and the workpiece revision's turn range and user message IDs. Associations are temporal context, not semantic justification.",
    input: elementSchema,
    output: v.custom<ReturnType<typeof queryWorkpiece>>(() => true),
    async run({ data }) {
      return {
        output: queryWorkpiece({
          snapshot: await options.history(),
          current: options.current,
          browser: options.browser,
          query: data.selector,
        }),
        terminate: false,
      };
    },
  });
