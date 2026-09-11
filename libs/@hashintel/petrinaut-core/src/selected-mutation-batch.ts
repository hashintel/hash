import { z } from "zod";

import { mutationActionInputSchemas } from "./action-schemas";

import type { AbortSignalLike } from "./environment";

export const selectedMutationOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    operationId: z.string().min(1),
    type: z.literal("addPlace"),
    input: mutationActionInputSchemas.addPlace,
  }),
  z.strictObject({
    operationId: z.string().min(1),
    type: z.literal("addTransition"),
    input: mutationActionInputSchemas.addTransition,
  }),
  z.strictObject({
    operationId: z.string().min(1),
    type: z.literal("addArc"),
    input: mutationActionInputSchemas.addArc,
  }),
  z.strictObject({
    operationId: z.string().min(1),
    type: z.literal("removePlace"),
    input: mutationActionInputSchemas.removePlace,
  }),
  z.strictObject({
    operationId: z.string().min(1),
    type: z.literal("removeTransition"),
    input: mutationActionInputSchemas.removeTransition,
  }),
  z.strictObject({
    operationId: z.string().min(1),
    type: z.literal("removeArc"),
    input: mutationActionInputSchemas.removeArc,
  }),
]);

export const selectedMutationBatchSchema = z
  .array(selectedMutationOperationSchema)
  .min(1)
  .max(30)
  .superRefine((operations, context) => {
    const operationIds = new Set<string>();
    operations.forEach(({ operationId }, index) => {
      if (operationIds.has(operationId)) {
        context.addIssue({
          code: "custom",
          path: [index, "operationId"],
          message: "operationId must be unique within the batch",
        });
      }
      operationIds.add(operationId);
    });
  });

export type SelectedMutationOperation = z.infer<
  typeof selectedMutationOperationSchema
>;

export type SelectedMutationEffect = {
  readonly classification: "direct" | "derived";
  readonly path: string;
} & (
  | { readonly kind: "created"; readonly after: unknown }
  | {
      readonly kind: "updated";
      readonly before: unknown;
      readonly after: unknown;
    }
  | { readonly kind: "deleted"; readonly before: unknown }
);

export type SelectedMutationAttempt =
  | {
      readonly status: "applied" | "no-op";
      readonly preHash: string;
      readonly postHash: string;
      readonly effects: readonly SelectedMutationEffect[];
    }
  | {
      readonly status: "failed" | "unknown";
      readonly preHash: string;
      readonly postHash?: string;
      readonly error: string;
    };

export type SelectedMutationOutcome =
  | ({
      readonly index: number;
      readonly operationId: string;
    } & SelectedMutationAttempt)
  | {
      readonly index: number;
      readonly operationId: string;
      readonly status: "unattempted";
    };

export const executeSelectedMutationBatch = async (
  operations: readonly SelectedMutationOperation[],
  apply: (
    operation: SelectedMutationOperation,
    index: number,
  ) => Promise<SelectedMutationAttempt> | SelectedMutationAttempt,
  options?: { readonly signal?: AbortSignalLike },
): Promise<SelectedMutationOutcome[]> => {
  const parsed = selectedMutationBatchSchema.parse(operations);
  const outcomes: SelectedMutationOutcome[] = [];
  const pushUnattempted = (fromIndex: number) => {
    for (
      let suffixIndex = fromIndex;
      suffixIndex < parsed.length;
      suffixIndex++
    ) {
      const suffix = parsed[suffixIndex];
      if (!suffix) throw new Error("Missing validated mutation operation.");
      outcomes.push({
        index: suffixIndex,
        operationId: suffix.operationId,
        status: "unattempted",
      });
    }
  };

  for (const [index, operation] of parsed.entries()) {
    if (options?.signal?.aborted) {
      pushUnattempted(index);
      break;
    }
    let attempt: SelectedMutationAttempt;
    try {
      attempt = await apply(operation, index);
    } catch (error) {
      attempt = {
        status: "unknown",
        preHash: "unavailable",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    outcomes.push({ index, operationId: operation.operationId, ...attempt });
    if (attempt.status === "applied" || attempt.status === "no-op") continue;
    pushUnattempted(index + 1);
    break;
  }

  return outcomes;
};
