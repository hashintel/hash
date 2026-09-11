import { z } from "zod";

import {
  deriveMutationEffects,
  mutatePetrinetAttemptCallId,
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
  observedMutationOutcome,
  type MutationEffects,
  type BrowserBinding,
  type ConstructionMutationAttempt,
  type ConstructionMutationRequest,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  executeSelectedMutationBatch,
  selectedMutationBatchSchema,
  type PetrinautMutations,
  type SelectedMutationEffect,
  type SelectedMutationOperation,
} from "@hashintel/petrinaut-core";

import { observeBrowserDefinition } from "./mutation-record";

import type { PetrinautAiAutomaticTool } from "@hashintel/petrinaut/ui";

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
  mutations: Pick<
    PetrinautMutations,
    | "addPlace"
    | "addTransition"
    | "addArc"
    | "removePlace"
    | "removeTransition"
    | "removeArc"
  >,
  operation: SelectedMutationOperation,
): void => {
  switch (operation.type) {
    case "addPlace":
      mutations.addPlace(operation.input);
      break;
    case "addTransition":
      mutations.addTransition(operation.input);
      break;
    case "addArc":
      mutations.addArc(operation.input);
      break;
    case "removePlace":
      mutations.removePlace(operation.input);
      break;
    case "removeTransition":
      mutations.removeTransition(operation.input);
      break;
    case "removeArc":
      mutations.removeArc(operation.input);
      break;
    default: {
      operation satisfies never;
      throw new Error("Unsupported mutate_petrinet operation");
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
    readonly retainAttempt?: (
      attempt: ConstructionMutationAttempt,
      retainOptions?: { verifyEffects?: boolean },
    ) => void;
  },
): PetrinautAiAutomaticTool => ({
  toolName: mutatePetrinetToolName,
  inputSchema: mutatePetrinetInputSchema,
  outputSchema: mutatePetrinetOutputSchema,
  async execute({ input, mutations, handle, toolCallId, signal }) {
    const request = mutatePetrinetInputSchema.parse(input);
    const beforeBatch = observeBrowserDefinition(handle);
    if (request.observation.baseHash !== beforeBatch.sha256)
      throw new Error(
        "mutate_petrinet does not cite the current observed base",
      );
    const operations = selectedMutationBatchSchema.parse(
      request.operations.map(
        ({ basisId: _basisId, ...operation }) => operation,
      ),
    );
    const retainRecord = (
      attempt: ConstructionMutationAttempt,
      retainOptions?: { verifyEffects?: boolean },
    ) => {
      options?.retainAttempt?.(attempt, retainOptions);
    };
    const outcomes = await executeSelectedMutationBatch(
      operations,
      (operation) => {
        const pre = observeBrowserDefinition(handle);
        const mutationRequest: ConstructionMutationRequest = {
          toolCallId: mutatePetrinetAttemptCallId(
            toolCallId,
            operation.operationId,
          ),
          toolName: operation.type,
          input: operation.input,
          observationToolCallId: request.observation.toolCallId,
          binding,
          requestedBaseHash: pre.sha256,
        };
        try {
          executeCanonicalMutation(mutations, operation);
          const post = observeBrowserDefinition(handle);
          const effects = deriveMutationEffects(
            mutationRequest,
            pre.definition,
            post.definition,
          );
          retainRecord({
            request: mutationRequest,
            binding,
            pre,
            post,
            outcome: observedMutationOutcome({
              request: mutationRequest,
              binding,
              pre,
              post,
              effects,
            }),
            effects,
          });
          return {
            status: pre.sha256 === post.sha256 ? "no-op" : "applied",
            preHash: pre.sha256,
            postHash: post.sha256,
            effects: structuralEffects(effects),
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
          const message =
            error instanceof Error ? error.message : String(error);
          try {
            const post = observeBrowserDefinition(handle);
            const effects = deriveMutationEffects(
              mutationRequest,
              pre.definition,
              post.definition,
            );
            const status = pre.sha256 === post.sha256 ? "failed" : "unknown";
            reportFailure(status);
            retainRecord({
              request: mutationRequest,
              binding,
              pre,
              post,
              outcome: status,
              effects,
              error: message,
            });
            return {
              status,
              preHash: pre.sha256,
              postHash: post.sha256,
              error: message,
            } as const;
          } catch {
            reportFailure("unknown");
            retainRecord(
              {
                request: mutationRequest,
                binding,
                pre,
                outcome: "unknown",
                effects: {
                  created: [],
                  updated: [],
                  deleted: [],
                  derived: [],
                },
                error: message,
              },
              { verifyEffects: false },
            );
            return {
              status: "unknown",
              preHash: pre.sha256,
              error: message,
            } as const;
          }
        }
      },
      { signal },
    );
    const withBases = outcomes.map((outcome) => {
      const operation = request.operations[outcome.index];
      if (!operation) throw new Error("Missing batch operation outcome.");
      return { ...outcome, basisId: operation.basisId };
    });
    const afterBatch = observeBrowserDefinition(handle);
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
