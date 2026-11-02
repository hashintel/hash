/**
 * The HASH agent's Petrinaut tools: Brunch's own names over Petrinaut's
 * canonical mutations, each addressed to an editor by `editor_id`. A tool
 * runs one canonical operation, or, for a merged update, several in a fixed
 * order within one call. The HASH agent mounts them in place of the
 * operations they map, and HASH's process page runs them; the website's agent
 * keeps Petrinaut's names.
 */

import { z } from "zod";

import {
  mutationActionInputSchemas,
  petrinautAiTools,
  type PetrinautAiMutationToolInput,
  type PetrinautAiMutationToolName,
  type PetrinautAiToolName,
} from "@hashintel/petrinaut-core/ai";

/**
 * The one editor HASH's process page shows. While a page shows one editor,
 * every Petrinaut tool names it; a call naming any other is not started.
 */
export const hashProcessEditorId = "process-editor";

const editorIdSchema = z.string().meta({
  description: "The editor to act on, as your instructions name it.",
});

/** One call of a canonical operation, as Petrinaut's mutation execution takes it. */
export type PetrinautOperationCall = {
  [Operation in PetrinautAiMutationToolName]: {
    readonly toolName: Operation;
    readonly input: PetrinautAiMutationToolInput<Operation>;
  };
}[PetrinautAiMutationToolName];

interface HashPetrinautTool {
  /** Every canonical operation the tool may run, in the order it runs them. */
  readonly operations: readonly PetrinautAiMutationToolName[];
  readonly description: string;
  readonly inputSchema: z.ZodType<{ editor_id: string }>;
  /**
   * The editor a call names, and the canonical calls it makes there, in
   * order. A merged update runs its one step that can fail first, so a call
   * either changes nothing or completes.
   */
  readonly parseCall: (input: unknown) => {
    readonly editorId: string;
    readonly calls: readonly PetrinautOperationCall[];
  };
}

/** A canonical call, its input parsed by the operation's own schema. */
const operationCall = (
  toolName: PetrinautAiMutationToolName,
  input: Record<string, unknown>,
): PetrinautOperationCall =>
  // Indexed by a union, the schema's output is any operation's input; this one
  // is `toolName`'s own.
  ({
    toolName,
    input: mutationActionInputSchemas[toolName].parse(
      Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      ),
    ),
  }) as PetrinautOperationCall;

/** A tool that runs one canonical operation, with the operation's input and description. */
const mapped = (operation: PetrinautAiMutationToolName): HashPetrinautTool => {
  const inputSchema = mutationActionInputSchemas[operation].extend({
    editor_id: editorIdSchema,
  });
  return {
    operations: [operation],
    description: petrinautAiTools[operation].description,
    inputSchema,
    parseCall: (input) => {
      const { editor_id: editorId, ...operationInput } =
        inputSchema.parse(input);
      return { editorId, calls: [operationCall(operation, operationInput)] };
    },
  };
};

/**
 * A tool that runs several canonical operations in one call: its input
 * combines theirs, requiring only what every one of them requires, and
 * `split` gives the calls it makes, in `operations` order.
 */
const merged = <Shape extends z.core.$ZodShape>({
  operations,
  description,
  shape,
  split,
}: {
  readonly operations: readonly PetrinautAiMutationToolName[];
  readonly description: string;
  readonly shape: Shape;
  readonly split: (
    input: z.output<z.ZodObject<Shape>>,
  ) => readonly PetrinautOperationCall[];
}): HashPetrinautTool => {
  // Generic in `Shape`, zod can't see `editor_id` in the object's output.
  const inputSchema = z.strictObject({
    ...shape,
    editor_id: editorIdSchema,
  }) as unknown as z.ZodType<
    z.output<z.ZodObject<Shape>> & { editor_id: string }
  >;
  return {
    operations,
    description,
    inputSchema,
    parseCall: (input) => {
      const { editor_id: editorId, ...rest } = inputSchema.parse(input);
      return {
        editorId,
        calls: split(rest as z.output<z.ZodObject<Shape>>),
      };
    },
  };
};

const schemas = mutationActionInputSchemas;

const nodeIdSchemas = {
  placeId: schemas.updatePlace.shape.placeId,
  transitionId: schemas.updateTransition.shape.transitionId,
  instanceId: schemas.updateComponentInstance.shape.instanceId,
};

/**
 * An update of an element's fields, its canvas position, or both: the fields
 * first, since only their validation can fail.
 */
const mergedNodeUpdate = (
  update: "updatePlace" | "updateTransition" | "updateComponentInstance",
  position:
    | "updatePlacePosition"
    | "updateTransitionPosition"
    | "updateComponentInstancePosition",
  key: keyof typeof nodeIdSchemas,
  description: string,
) =>
  merged({
    operations: [update, position],
    description,
    shape: {
      [key]: nodeIdSchemas[key],
      update: schemas[update].shape.update.optional(),
      position: schemas[position].shape.position.optional(),
      targetSubnetId: schemas[update].shape.targetSubnetId,
    },
    split: ({ update: fields, position: at, targetSubnetId, ...rest }) => {
      const id = rest[key];
      return [
        ...(fields === undefined
          ? []
          : [
              operationCall(update, {
                [key]: id,
                update: fields,
                targetSubnetId,
              }),
            ]),
        ...(at === undefined
          ? []
          : [
              operationCall(position, {
                [key]: id,
                position: at,
                targetSubnetId,
              }),
            ]),
      ];
    },
  });

/** HASH's Petrinaut tools, by model-facing name. */
export const hashPetrinautTools = {
  petrinaut_create_place: mapped("addPlace"),
  petrinaut_update_place: mergedNodeUpdate(
    "updatePlace",
    "updatePlacePosition",
    "placeId",
    "Update fields on an existing place, its canvas position, or both.",
  ),
  petrinaut_remove_place: mapped("removePlace"),
  petrinaut_create_transition: mapped("addTransition"),
  petrinaut_update_transition: mergedNodeUpdate(
    "updateTransition",
    "updateTransitionPosition",
    "transitionId",
    "Update a transition's properties, arcs or executable code, its canvas position, or both.",
  ),
  petrinaut_remove_transition: mapped("removeTransition"),
  petrinaut_create_arc: mapped("addArc"),
  petrinaut_update_arc: merged({
    operations: ["updateArcPlace", "updateArcType", "updateArcWeight"],
    description:
      "Update an existing arc, identified by its transition, direction and current endpoint (`placeId` or `endpoint`): its endpoint (`newPlaceId` or `newEndpoint`), its input arc type, its weight, or several at once.",
    shape: {
      transitionId: schemas.updateArcWeight.shape.transitionId,
      arcDirection: schemas.updateArcWeight.shape.arcDirection,
      placeId: schemas.updateArcWeight.shape.placeId,
      endpoint: schemas.updateArcWeight.shape.endpoint,
      newPlaceId: schemas.updateArcPlace.shape.newPlaceId,
      newEndpoint: schemas.updateArcPlace.shape.newEndpoint,
      type: schemas.updateArcType.shape.type.optional(),
      weight: schemas.updateArcWeight.shape.weight.optional(),
      targetSubnetId: schemas.updateArcWeight.shape.targetSubnetId,
    },
    split: ({
      transitionId,
      arcDirection,
      placeId,
      endpoint,
      newPlaceId,
      newEndpoint,
      type,
      weight,
      targetSubnetId,
    }) => {
      // The retarget is the one step that can fail, so it runs first; the
      // others then find the arc at its new endpoint.
      const retargeted = newPlaceId !== undefined || newEndpoint !== undefined;
      const at = retargeted
        ? { placeId: newPlaceId, endpoint: newEndpoint }
        : { placeId, endpoint };
      return [
        ...(retargeted
          ? [
              operationCall("updateArcPlace", {
                transitionId,
                arcDirection,
                oldPlaceId: placeId,
                oldEndpoint: endpoint,
                newPlaceId,
                newEndpoint,
                targetSubnetId,
              }),
            ]
          : []),
        ...(type === undefined
          ? []
          : [
              operationCall("updateArcType", {
                transitionId,
                ...at,
                type,
                targetSubnetId,
              }),
            ]),
        ...(weight === undefined
          ? []
          : [
              operationCall("updateArcWeight", {
                transitionId,
                arcDirection,
                ...at,
                weight,
                targetSubnetId,
              }),
            ]),
      ];
    },
  }),
  petrinaut_remove_arc: mapped("removeArc"),
  petrinaut_create_type: mapped("addType"),
  petrinaut_update_type: mapped("updateType"),
  petrinaut_remove_type: mapped("removeType"),
  petrinaut_create_type_element: mapped("addTypeElement"),
  petrinaut_update_type_element: merged({
    operations: ["updateTypeElement", "moveTypeElement"],
    description:
      "Update fields on an existing type element, move it to another index within its type, or both.",
    shape: {
      typeId: schemas.updateTypeElement.shape.typeId,
      elementId: schemas.updateTypeElement.shape.elementId,
      update: schemas.updateTypeElement.shape.update.optional(),
      toIndex: schemas.moveTypeElement.shape.toIndex.optional(),
      targetSubnetId: schemas.updateTypeElement.shape.targetSubnetId,
    },
    split: ({ typeId, elementId, update, toIndex, targetSubnetId }) => [
      ...(update === undefined
        ? []
        : [
            operationCall("updateTypeElement", {
              typeId,
              elementId,
              update,
              targetSubnetId,
            }),
          ]),
      ...(toIndex === undefined
        ? []
        : [
            operationCall("moveTypeElement", {
              typeId,
              elementId,
              toIndex,
              targetSubnetId,
            }),
          ]),
    ],
  }),
  petrinaut_remove_type_element: mapped("removeTypeElement"),
  petrinaut_create_equation: mapped("addDifferentialEquation"),
  petrinaut_update_equation: mapped("updateDifferentialEquation"),
  petrinaut_remove_equation: mapped("removeDifferentialEquation"),
  petrinaut_create_parameter: mapped("addParameter"),
  petrinaut_update_parameter: mapped("updateParameter"),
  petrinaut_remove_parameter: mapped("removeParameter"),
  petrinaut_create_scenario: mapped("addScenario"),
  petrinaut_update_scenario: mapped("updateScenario"),
  petrinaut_remove_scenario: mapped("removeScenario"),
  petrinaut_create_metric: mapped("addMetric"),
  petrinaut_update_metric: mapped("updateMetric"),
  petrinaut_remove_metric: mapped("removeMetric"),
  petrinaut_create_subnet: mapped("addSubnet"),
  petrinaut_update_subnet: mapped("updateSubnet"),
  petrinaut_remove_subnet: mapped("removeSubnet"),
  petrinaut_create_component: mapped("addComponentInstance"),
  petrinaut_update_component: mergedNodeUpdate(
    "updateComponentInstance",
    "updateComponentInstancePosition",
    "instanceId",
    "Update fields on an existing component instance, its canvas position, or both.",
  ),
  petrinaut_remove_component: mapped("removeComponentInstance"),
} as const satisfies Record<string, HashPetrinautTool>;

export type HashPetrinautToolName = keyof typeof hashPetrinautTools;

/**
 * The canonical operations the HASH agent doesn't mount: those its own tools
 * run, and those it drops (`deleteItemsByIds`, for the per-kind removes;
 * `commitNodePositions`, for the position updates).
 */
export const hashReplacedPetrinautOperations: ReadonlySet<PetrinautAiToolName> =
  new Set<PetrinautAiToolName>([
    ...Object.values(hashPetrinautTools).flatMap(
      ({ operations }) => operations,
    ),
    "deleteItemsByIds",
    "commitNodePositions",
  ]);
