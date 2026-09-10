import { z } from "zod";

import { selectedMutationOperationSchema } from "@hashintel/petrinaut-core";

import { declaredBasisSchema, sha256Schema } from "./declared-basis";

export const batchedConstructionMode = "batched-construction";
export const mutatePetrinetToolName = "mutate_petrinet";

/** Browser-safe selected batch carrier; execution remains split across Flue and the host. */
export const mutatePetrinetInputSchema = z
  .strictObject({
    observation: z.strictObject({
      toolCallId: z.string().min(1),
      baseHash: sha256Schema,
    }),
    bases: z
      .array(
        z.strictObject({
          basisId: z.string().min(1),
          basis: declaredBasisSchema,
        }),
      )
      .min(1),
    operations: z
      .array(
        z.strictObject({
          basisId: z.string().min(1),
          operation: selectedMutationOperationSchema,
        }),
      )
      .min(1)
      .max(30),
  })
  .superRefine(({ bases, operations }, context) => {
    const basisIds = new Set<string>();
    for (const [index, { basisId }] of bases.entries()) {
      if (basisIds.has(basisId))
        context.addIssue({
          code: "custom",
          path: ["bases", index, "basisId"],
          message: "basisId must be unique",
        });
      basisIds.add(basisId);
    }
    const operationIds = new Set<string>();
    for (const [index, { basisId, operation }] of operations.entries()) {
      if (!basisIds.has(basisId))
        context.addIssue({
          code: "custom",
          path: ["operations", index, "basisId"],
          message: "basisId must name a declared basis",
        });
      if (operationIds.has(operation.operationId))
        context.addIssue({
          code: "custom",
          path: ["operations", index, "operation", "operationId"],
          message: "operationId must be unique",
        });
      operationIds.add(operation.operationId);
      if (operation.input.targetSubnetId)
        context.addIssue({
          code: "custom",
          path: ["operations", index, "operation", "input", "targetSubnetId"],
          message: "Only root mutations are admitted",
        });
      if (
        operation.type === "addArc" &&
        (operation.input.placeId === undefined ||
          operation.input.endpoint !== undefined)
      )
        context.addIssue({
          code: "custom",
          path: ["operations", index, "operation", "input", "placeId"],
          message: "Only root place arcs are admitted",
        });
    }
  });
