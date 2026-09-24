import { z } from "zod";

import { type SDCPN } from "@hashintel/petrinaut-core";

import { rootArcWhyInputSchema } from "./root-arc";
import { rootStateWhyInputSchema } from "./root-state";

export const rootNodeWhyInputSchema = z.strictObject({
  kind: z.enum(["place", "transition"]),
  name: z
    .string()
    .describe(
      "Unique name or ID of the selected element from read_petrinaut_net.",
    ),
  field: z
    .string()
    .default("entity")
    .describe(
      "Explain the whole element (entity), or one top-level field such as capacity or lambdaCode.",
    ),
  observationToolCallId: rootArcWhyInputSchema.shape.observationToolCallId,
});
export type RootNodeWhyInput = z.output<typeof rootNodeWhyInputSchema>;

export const constructionWhyInputSchema = z.union([
  rootArcWhyInputSchema,
  rootNodeWhyInputSchema,
  ...rootStateWhyInputSchema.options,
]);

const [rootEntityWhyInputSchema, rootTypeElementWhyInputSchema] =
  rootStateWhyInputSchema.options;
const currentDefinitionReadDescription =
  "Unique name or ID from the current mounted Petrinaut definition read.";
const modelRootArcWhyInputSchema = rootArcWhyInputSchema
  .omit({ observationToolCallId: true })
  .extend({
    transition: rootArcWhyInputSchema.shape.transition.describe(
      currentDefinitionReadDescription,
    ),
    place: rootArcWhyInputSchema.shape.place.describe(
      currentDefinitionReadDescription,
    ),
  });
const modelRootNodeWhyInputSchema = rootNodeWhyInputSchema
  .omit({ observationToolCallId: true })
  .extend({
    name: rootNodeWhyInputSchema.shape.name.describe(
      currentDefinitionReadDescription,
    ),
  });
const modelRootEntityWhyInputSchema = rootEntityWhyInputSchema
  .omit({ observationToolCallId: true })
  .extend({
    name: rootEntityWhyInputSchema.shape.name.describe(
      currentDefinitionReadDescription,
    ),
  });
const modelRootTypeElementWhyInputSchema = rootTypeElementWhyInputSchema
  .omit({ observationToolCallId: true })
  .extend({
    name: rootTypeElementWhyInputSchema.shape.name.describe(
      currentDefinitionReadDescription,
    ),
  });
const modelConstructionWhyInputSchema = z.union([
  modelRootArcWhyInputSchema,
  modelRootNodeWhyInputSchema,
  modelRootEntityWhyInputSchema,
  modelRootTypeElementWhyInputSchema,
]);

/** Model input selects semantics only; the host owns live-observation correlation. */
export const queryWorkpieceInputSchema = (construction: boolean) =>
  z.strictObject({
    selector: construction
      ? modelConstructionWhyInputSchema
      : modelRootArcWhyInputSchema,
  });

export const parseConstructionWhyInput = (input: unknown) =>
  constructionWhyInputSchema.parse(input);

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
export const batchedNodeMutationNames = [
  ...observedNodeMutationNames,
  "removePlace",
  "removeTransition",
] as const;
export type BatchedNodeMutationName = (typeof batchedNodeMutationNames)[number];
export const isBatchedNodeMutation = (
  name: string,
): name is BatchedNodeMutationName =>
  batchedNodeMutationNames.some((entry) => entry === name);
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
