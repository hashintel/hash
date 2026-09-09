import * as v from "valibot";

import { getArcEndpointPlaceId, type SDCPN } from "@hashintel/petrinaut-core";
import {
  petrinautAiTools,
  normalizePetrinautAiToolInput,
} from "@hashintel/petrinaut-core/ai";

import { observedArcEnvelopeSchema, rootArcWhyInputSchema } from "./root-arc";
import { rootStateWhyInputSchema } from "./root-state";

import type { ConstructionMutationRequest } from "./transition-record";

export const rootNodeWhyInputSchema = v.strictObject({
  kind: v.picklist(["place", "transition"]),
  name: v.string(),
  field: v.optional(v.string(), "entity"),
  observationToolCallId: v.optional(v.string()),
});
export type RootNodeWhyInput = v.InferOutput<typeof rootNodeWhyInputSchema>;

/** Flue requires an object at the tool root. Legacy arc queries keep their exact accepted shape. */
export const constructionWhyInputSchema = v.pipe(
  v.strictObject({
    ...v.partial(rootArcWhyInputSchema).entries,
    ...v.partial(rootNodeWhyInputSchema).entries,
    kind: v.optional(
      v.picklist([
        ...rootNodeWhyInputSchema.entries.kind.options,
        ...rootStateWhyInputSchema.entries.kind.options,
      ]),
    ),
    type: v.optional(v.string()),
  }),
  v.check(
    (input) =>
      v.safeParse(
        input.kind === undefined
          ? rootArcWhyInputSchema
          : input.kind === "place" || input.kind === "transition"
            ? rootNodeWhyInputSchema
            : rootStateWhyInputSchema,
        input,
      ).success,
    "Supply an exact root arc query or an entity kind/name/field query; type-element also requires its parent type.",
  ),
);
export const parseConstructionWhyInput = (input: unknown) => {
  const checked = v.parse(constructionWhyInputSchema, input);
  return checked.kind === undefined
    ? v.parse(rootArcWhyInputSchema, checked)
    : checked.kind === "place" || checked.kind === "transition"
      ? v.parse(rootNodeWhyInputSchema, checked)
      : v.parse(rootStateWhyInputSchema, checked);
};

export const observedNodeMutationNames = [
  "addPlace",
  "updatePlace",
  "addTransition",
  "updateTransition",
] as const;
export type ObservedNodeMutationName =
  (typeof observedNodeMutationNames)[number];
export const isObservedNodeMutation = (
  name: string,
): name is ObservedNodeMutationName =>
  observedNodeMutationNames.some((entry) => entry === name);
const rootOnly = (input: { targetSubnetId?: string | null }) =>
  !input.targetSubnetId;

/** Compose only the Brunch envelope. Petrinaut owns every executable input field. */
const schemas = {
  addPlace: petrinautAiTools.addPlace.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootOnly, { message: "Only root places are admitted." })
    .meta(petrinautAiTools.addPlace.inputSchema.meta() ?? {}),
  updatePlace: petrinautAiTools.updatePlace.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootOnly, { message: "Only root places are admitted." })
    .meta(petrinautAiTools.updatePlace.inputSchema.meta() ?? {}),
  addTransition: petrinautAiTools.addTransition.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootOnly, { message: "Only root transitions are admitted." })
    .meta(petrinautAiTools.addTransition.inputSchema.meta() ?? {}),
  updateTransition: petrinautAiTools.updateTransition.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootOnly, { message: "Only root transitions are admitted." })
    .meta(petrinautAiTools.updateTransition.inputSchema.meta() ?? {}),
};
export const observedNodeInputSchema = (name: ObservedNodeMutationName) =>
  schemas[name];
export const parseObservedNodeInput = (
  name: ObservedNodeMutationName,
  input: unknown,
) => schemas[name].parse(normalizePetrinautAiToolInput(name, input));

/** Pre-execution identity check uses verified definitions, never the model's courtesy. */
export const assertNodeIdentity = (
  mutation: Pick<ConstructionMutationRequest, "toolName" | "input">,
  current: SDCPN,
  earlier: readonly SDCPN[],
) => {
  if (!isObservedNodeMutation(mutation.toolName)) return;
  const parsed = petrinautAiTools[mutation.toolName].inputSchema.parse(
    mutation.input,
  );
  if (parsed.targetSubnetId)
    throw new Error("Nested construction is unavailable.");
  const colorId =
    "colorId" in parsed
      ? parsed.colorId
      : "update" in parsed && "colorId" in parsed.update
        ? parsed.update.colorId
        : undefined;
  if (
    colorId != null &&
    current.types.filter((type) => type.id === colorId).length !== 1
  )
    throw new Error("A typed place requires one unique existing root type.");
  if ("inputArcs" in parsed) {
    for (const arcs of [parsed.inputArcs, parsed.outputArcs]) {
      const places = arcs.map(getArcEndpointPlaceId);
      if (
        places.some(
          (id) =>
            id === null ||
            current.places.filter((place) => place.id === id).length !== 1,
        ) ||
        new Set(places).size !== places.length
      )
        throw new Error(
          "Embedded arcs require unique existing root places; component ports and ambiguous endpoints are unavailable.",
        );
    }
  }
  const collection = mutation.toolName.endsWith("Place")
    ? "places"
    : "transitions";
  const id =
    "id" in parsed
      ? parsed.id
      : "placeId" in parsed
        ? parsed.placeId
        : parsed.transitionId;
  const identities = (definition: SDCPN) =>
    [
      ...definition.places,
      ...definition.transitions,
      ...definition.types,
      ...definition.parameters,
      ...definition.differentialEquations,
      ...(definition.scenarios ?? []),
      ...(definition.subnets ?? []),
      ...(definition.componentInstances ?? []),
    ].map((entry) => entry.id);
  if ("id" in parsed) {
    if (identities(current).includes(id))
      throw new Error("Duplicate root identity cannot be created.");
    if (earlier.some((definition) => identities(definition).includes(id)))
      throw new Error(
        "Known-retired identity cannot be reused; choose a new identity.",
      );
  } else if (
    current[collection].filter((entry) => entry.id === id).length !== 1
  ) {
    throw new Error("Unknown or ambiguous node identity cannot be corrected.");
  }
};

/** Names are conveniences, never identities. The returned path is snapshot-relative. */
export const locateRootNode = (
  definition: SDCPN,
  query: Pick<RootNodeWhyInput, "kind" | "name" | "field">,
) => {
  const entries =
    query.kind === "place" ? definition.places : definition.transitions;
  const matches = entries.filter(
    (entry) => entry.id === query.name || entry.name === query.name,
  );
  const node = matches[0];
  if (matches.length !== 1 || !node)
    throw new Error("Unknown or ambiguous root node; use a unique ID.");
  const collection = query.kind === "place" ? "places" : "transitions";
  const nodePath = `/${collection}/${entries.findIndex((entry) => entry === node)}`;
  if (query.field !== "entity" && !Object.hasOwn(node, query.field))
    throw new Error(
      "The requested field is absent; no field origin is inferred.",
    );
  return {
    kind: query.kind,
    id: node.id,
    nodePath,
    path:
      query.field === "entity"
        ? nodePath
        : `${nodePath}/${query.field.replaceAll("~", "~0").replaceAll("/", "~1")}`,
    value:
      query.field === "entity"
        ? node
        : (node as unknown as Record<string, unknown>)[query.field],
    formalism:
      "Places store tokens; transitions define enabling and firing. Canonical defaults and generated code are not elicited operational facts.",
  };
};
