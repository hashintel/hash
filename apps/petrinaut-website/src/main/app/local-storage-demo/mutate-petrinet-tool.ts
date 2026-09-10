import { z } from "zod";

import {
  deriveMutationEffects,
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
  type MutationEffects,
  type BrowserBinding,
  type ConstructionMutationRequest,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  executeSelectedMutationBatch,
  selectedMutationBatchSchema,
  type Petrinaut,
  type SelectedMutationEffect,
  type SelectedMutationOperation,
} from "@hashintel/petrinaut-core";

import { observeBrowserDefinition } from "./mutation-record";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const effectSchema = z.intersection(
  z.strictObject({
    classification: z.enum(["direct", "derived"]),
    path: z.string(),
  }),
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("created"), after: z.unknown() }),
    z.strictObject({
      kind: z.literal("updated"),
      before: z.unknown(),
      after: z.unknown(),
    }),
    z.strictObject({ kind: z.literal("deleted"), before: z.unknown() }),
  ]),
);
const completedOutcomeFields = {
  index: z.number().int().nonnegative(),
  operationId: z.string().min(1),
  basisId: z.string().min(1),
  preHash: hashSchema,
  postHash: hashSchema,
};
const mutationOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...completedOutcomeFields,
    status: z.literal("applied"),
    effects: z.array(effectSchema),
  }),
  z.strictObject({
    ...completedOutcomeFields,
    status: z.literal("no-op"),
    effects: z.array(effectSchema),
  }),
  z.strictObject({
    ...completedOutcomeFields,
    status: z.literal("failed"),
    error: z.string(),
  }),
  z.strictObject({
    index: z.number().int().nonnegative(),
    operationId: z.string().min(1),
    basisId: z.string().min(1),
    status: z.literal("unknown"),
    preHash: hashSchema,
    postHash: hashSchema.optional(),
    error: z.string(),
  }),
  z.strictObject({
    index: z.number().int().nonnegative(),
    operationId: z.string().min(1),
    basisId: z.string().min(1),
    status: z.literal("unattempted"),
  }),
]);

export const mutatePetrinetOutputSchema = z
  .strictObject({
    execution: z.literal("ordered-stop"),
    toolCallId: z.string().min(1),
    observationToolCallId: z.string().min(1),
    preHash: hashSchema,
    postHash: hashSchema,
    outcomes: z.array(mutationOutcomeSchema).min(1),
  })
  .superRefine(({ outcomes }, context) => {
    outcomes.forEach(({ index }, position) => {
      if (index !== position)
        context.addIssue({
          code: "custom",
          path: ["outcomes", position, "index"],
          message: "outcome indices must be complete and ordered",
        });
    });
  });

const executeCanonicalMutation = (
  instance: Petrinaut,
  operation: SelectedMutationOperation,
): void => {
  switch (operation.type) {
    case "addPlace":
      instance.mutations.addPlace(operation.input);
      break;
    case "addTransition":
      instance.mutations.addTransition(operation.input);
      break;
    case "addArc":
      instance.mutations.addArc(operation.input);
      break;
    case "removePlace":
      instance.mutations.removePlace(operation.input);
      break;
    case "removeTransition":
      instance.mutations.removeTransition(operation.input);
      break;
    case "removeArc":
      instance.mutations.removeArc(operation.input);
      break;
    default: {
      const exhaustive: never = operation;
      throw new Error(`Unsupported mutate_petrinet operation ${exhaustive}`);
    }
  }
};

const structuralEffects = (
  effects: MutationEffects,
): SelectedMutationEffect[] => [
  ...effects.created.map((effect) => ({
    classification: "direct" as const,
    ...effect,
  })),
  ...effects.updated.map((effect) => ({
    classification: "direct" as const,
    ...effect,
  })),
  ...effects.deleted.map((effect) => ({
    classification: "direct" as const,
    ...effect,
  })),
  ...effects.derived.map((effect) => ({
    classification: "derived" as const,
    ...effect,
  })),
];

/**
 * One operation of a batch stopped execution. The outcome the model sees is
 * unchanged; this is the host's chance to see the thrown value.
 */
export interface MutatePetrinetOperationFailure {
  readonly toolCallId: string;
  readonly operationId: string;
  readonly operationType: SelectedMutationOperation["type"];
  readonly status: "failed" | "unknown";
  readonly error: unknown;
}

export const createMutatePetrinetAutomaticTool = (
  binding: BrowserBinding,
  options?: {
    readonly onOperationFailure?: (
      failure: MutatePetrinetOperationFailure,
    ) => void;
  },
) => ({
  toolName: mutatePetrinetToolName,
  inputSchema: mutatePetrinetInputSchema,
  outputSchema: mutatePetrinetOutputSchema,
  async execute({
    input,
    instance,
    toolCallId,
  }: {
    input: unknown;
    instance: Petrinaut;
    toolCallId: string;
  }) {
    const request = mutatePetrinetInputSchema.parse(input);
    const beforeBatch = observeBrowserDefinition(instance.handle);
    if (request.observation.baseHash !== beforeBatch.sha256)
      throw new Error(
        "mutate_petrinet does not cite the current observed base",
      );
    const operations = selectedMutationBatchSchema.parse(
      request.operations.map(
        ({ basisId: _basisId, ...operation }) => operation,
      ),
    );
    const outcomes = await executeSelectedMutationBatch(
      operations,
      (operation) => {
        const pre = observeBrowserDefinition(instance.handle);
        const mutationRequest: ConstructionMutationRequest = {
          toolCallId: `${toolCallId}:${operation.operationId}`,
          toolName: operation.type,
          input: operation.input,
          observationToolCallId: request.observation.toolCallId,
          binding,
          requestedBaseHash: pre.sha256,
        };
        try {
          executeCanonicalMutation(instance, operation);
          const post = observeBrowserDefinition(instance.handle);
          const effects = structuralEffects(
            deriveMutationEffects(
              mutationRequest,
              pre.definition,
              post.definition,
            ),
          );
          return {
            status: pre.sha256 === post.sha256 ? "no-op" : "applied",
            preHash: pre.sha256,
            postHash: post.sha256,
            effects,
          } as const;
        } catch (error) {
          const reportFailure = (status: "failed" | "unknown") =>
            options?.onOperationFailure?.({
              toolCallId,
              operationId: operation.operationId,
              operationType: operation.type,
              status,
              error,
            });
          try {
            const post = observeBrowserDefinition(instance.handle);
            const status = pre.sha256 === post.sha256 ? "failed" : "unknown";
            reportFailure(status);
            return {
              status,
              preHash: pre.sha256,
              postHash: post.sha256,
              error: error instanceof Error ? error.message : String(error),
            } as const;
          } catch {
            reportFailure("unknown");
            return {
              status: "unknown",
              preHash: pre.sha256,
              error: error instanceof Error ? error.message : String(error),
            } as const;
          }
        }
      },
    );
    const withBases = outcomes.map((outcome) => {
      const operation = request.operations[outcome.index];
      if (!operation) throw new Error("Missing batch operation outcome.");
      return { ...outcome, basisId: operation.basisId };
    });
    const afterBatch = observeBrowserDefinition(instance.handle);
    return {
      execution: "ordered-stop" as const,
      toolCallId,
      observationToolCallId: request.observation.toolCallId,
      preHash: beforeBatch.sha256,
      postHash: afterBatch.sha256,
      outcomes: withBases,
    };
  },
});
