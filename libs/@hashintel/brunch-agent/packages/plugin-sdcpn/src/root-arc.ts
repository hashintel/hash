import * as v from "valibot";
import { z } from "zod";

import {
  normalizePetrinautAiToolInput,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import { declaredBasisSchema, sha256Schema } from "./declared-basis";

import type { SDCPN } from "@hashintel/petrinaut-core";

export const conversationConstructionMode =
  "conversation-construction-candidate";
export const observedConstructionBrowserToolNames = [
  "getLatestNetDefinition",
  "addArc",
  "updateArcWeight",
  "addPlace",
  "updatePlace",
  "addTransition",
  "updateTransition",
  "getNetCompilationErrors",
] as const;

/** Names are conveniences; ambiguous names refuse rather than choosing an occurrence. */
export const rootArcWhyInputSchema = v.strictObject({
  transition: v.string(),
  place: v.string(),
  arcDirection: v.picklist(["input", "output"]),
  field: v.optional(
    v.picklist(["entity", "placeId", "weight", "type"]),
    "entity",
  ),
  observationToolCallId: v.optional(v.string()),
});
export type RootArcWhyInput = v.InferOutput<typeof rootArcWhyInputSchema>;

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

export const rootArcEnvelopeSchema = z.strictObject({
  basis: declaredBasisSchema,
  requestedBaseHash: sha256Schema,
});

const canonical = petrinautAiTools.addArc.inputSchema;
/** safeExtend retains Petrinaut's runtime .check rules; no canonical fields are copied. */
export const joinedRootArcInputSchema = canonical
  .safeExtend({ brunch: rootArcEnvelopeSchema })
  .refine(
    (input) => !input.targetSubnetId && typeof input.placeId === "string",
    {
      message: "Only root place arcs are admitted.",
    },
  )
  .describe(petrinautAiTools.addArc.description);

export const observedArcEnvelopeSchema = rootArcEnvelopeSchema.extend({
  observationToolCallId: z.string().min(1),
});
const rootPlaceArc = (input: {
  targetSubnetId?: string | null;
  placeId?: string;
}) => !input.targetSubnetId && typeof input.placeId === "string";
const observedArcSchemas = {
  addArc: petrinautAiTools.addArc.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootPlaceArc, { message: "Only root place arcs are admitted." })
    .describe(petrinautAiTools.addArc.description),
  updateArcWeight: petrinautAiTools.updateArcWeight.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootPlaceArc, { message: "Only root place arcs are admitted." })
    .describe(petrinautAiTools.updateArcWeight.description),
};
export const observedArcInputSchema = (name: "addArc" | "updateArcWeight") =>
  observedArcSchemas[name];
export const parseObservedArcInput = (
  name: "addArc" | "updateArcWeight",
  input: unknown,
) =>
  observedArcInputSchema(name).parse(
    normalizePetrinautAiToolInput(name, input),
  );

/** Shared explicit compatibility boundary for retained raw calls and browser execution. */
export const parseJoinedRootArcInput = (input: unknown) =>
  joinedRootArcInputSchema.parse(
    normalizePetrinautAiToolInput("addArc", input),
  );
