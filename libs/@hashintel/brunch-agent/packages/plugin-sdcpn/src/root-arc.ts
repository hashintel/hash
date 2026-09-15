import * as v from "valibot";
import { z } from "zod";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import type { SDCPN } from "@hashintel/petrinaut-core";

export const observedArcMutationNames = ["addArc", "updateArcWeight"] as const;
export type ObservedArcMutationName = (typeof observedArcMutationNames)[number];
export const batchedArcMutationNames = [
  ...observedArcMutationNames,
  "removeArc",
  "updateArcType",
] as const;
export type BatchedArcMutationName = (typeof batchedArcMutationNames)[number];
export const isBatchedArcMutation = (
  name: string,
): name is BatchedArcMutationName =>
  batchedArcMutationNames.some((entry) => entry === name);

/** Names are conveniences; ambiguous names refuse rather than choosing an occurrence. */
export const rootArcWhyInputSchema = z.strictObject({
  transition: z
    .string()
    .describe("Unique transition name or ID from read_petrinaut_net."),
  place: z
    .string()
    .describe("Unique root-place name or ID from read_petrinaut_net."),
  arcDirection: petrinautAiTools.addArc.inputSchema.shape.arcDirection,
  field: z
    .enum(["entity", "placeId", "weight", "type"])
    .default("entity")
    .describe("Explain the whole arc (entity), or the named arc field."),
  observationToolCallId: z
    .string()
    .optional()
    .describe(
      "Copy output.observation.toolCallId from a fresh read_petrinaut_net result. Omit only for an explicitly historical, as-of explanation, not a claim about the live canvas.",
    ),
});
export type RootArcWhyInput = z.output<typeof rootArcWhyInputSchema>;

export const locateRootArc = (definition: SDCPN, query: RootArcWhyInput) => {
  const transitions = definition.transitions.filter(
    (entry) => entry.id === query.transition || entry.name === query.transition,
  );
  const places = definition.places.filter(
    (entry) => entry.id === query.place || entry.name === query.place,
  );
  const transition = transitions[0];
  const place = places[0];
  if (transitions.length !== 1 || places.length !== 1 || !transition || !place)
    throw new Error("Unknown or ambiguous root arc endpoint; use unique IDs.");
  const direction = query.arcDirection === "input" ? "inputArcs" : "outputArcs";
  const arcs = transition[direction].filter(
    (arc) => "placeId" in arc && arc.placeId === place.id,
  );
  const arc = arcs[0];
  if (arcs.length !== 1 || !arc)
    throw new Error(
      "The requested root arc is absent or ambiguous; no identity continuity is inferred.",
    );
  const path = `/transitions/${definition.transitions.indexOf(transition)}/${direction}/${transition[direction].findIndex((entry) => entry === arc)}`;
  return {
    kind: "arc" as const,
    transitionId: transition.id,
    placeId: place.id,
    arcDirection: query.arcDirection,
    path: query.field === "entity" ? path : `${path}/${query.field}`,
    arcPath: path,
    value:
      query.field === "entity"
        ? arc
        : query.field === "weight"
          ? arc.weight
          : query.field === "placeId" && "placeId" in arc
            ? arc.placeId
            : query.field === "type" && "type" in arc
              ? arc.type
              : null,
    formalism:
      "An arc connects its place and transition. Weight is token multiplicity; input type selects canonical Petrinaut arc behavior. These are formalism semantics, not elicited operational facts.",
  };
};

// Initial-data contracts stay Valibot-owned; only tool inputs use native Zod.
export const browserBindingSchema = v.strictObject({
  conversationId: v.pipe(v.string(), v.minLength(1)),
  documentId: v.pipe(v.string(), v.minLength(1)),
  incarnationId: v.pipe(v.string(), v.minLength(1)),
});
