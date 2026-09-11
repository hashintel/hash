import {
  deriveMutationEffects,
  mutatePetrinetAttemptCallId,
  mutatePetrinetInputSchema,
  mutatePetrinetOutputSchema,
  mutatePetrinautNetToolName,
  observedMutationOutcome,
  type MutationEffects,
  type BrowserBinding,
  type ConstructionMutationAttempt,
  type ConstructionMutationRequest,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  executeSelectedMutationBatch,
  selectedMutationBatchSchema,
  type PetrinautDocHandle,
  type PetrinautMutations,
  type SelectedMutationEffect,
  type SelectedMutationOperation,
} from "@hashintel/petrinaut-core";

import { observeBrowserDefinition } from "./mutation-record";

export { mutatePetrinetOutputSchema };

const executeCanonicalMutation = (
  mutations: Pick<
    PetrinautMutations,
    | "addPlace"
    | "addTransition"
    | "addArc"
    | "removePlace"
    | "removeTransition"
    | "removeArc"
    | "addType"
    | "addParameter"
    | "addDifferentialEquation"
    | "updateDifferentialEquation"
    | "updatePlace"
    | "updateTransition"
    | "updateArcWeight"
    | "updateArcType"
    | "updateType"
    | "addTypeElement"
    | "updateTypeElement"
    | "updateParameter"
    | "removeType"
    | "removeTypeElement"
    | "removeParameter"
    | "removeDifferentialEquation"
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
    case "addType":
      mutations.addType(operation.input);
      break;
    case "addParameter":
      mutations.addParameter(operation.input);
      break;
    case "addDifferentialEquation":
      mutations.addDifferentialEquation(operation.input);
      break;
    case "updateDifferentialEquation":
      mutations.updateDifferentialEquation(operation.input);
      break;
    case "updatePlace":
      mutations.updatePlace(operation.input);
      break;
    case "updateTransition":
      mutations.updateTransition(operation.input);
      break;
    case "updateArcWeight":
      mutations.updateArcWeight(operation.input);
      break;
    case "updateArcType":
      mutations.updateArcType(operation.input);
      break;
    case "updateType":
      mutations.updateType(operation.input);
      break;
    case "addTypeElement":
      mutations.addTypeElement(operation.input);
      break;
    case "updateTypeElement":
      mutations.updateTypeElement(operation.input);
      break;
    case "updateParameter":
      mutations.updateParameter(operation.input);
      break;
    case "removeType":
      mutations.removeType(operation.input);
      break;
    case "removeTypeElement":
      mutations.removeTypeElement(operation.input);
      break;
    case "removeParameter":
      mutations.removeParameter(operation.input);
      break;
    case "removeDifferentialEquation":
      mutations.removeDifferentialEquation(operation.input);
      break;
    default: {
      operation satisfies never;
      throw new Error("Unsupported mutate_petrinaut_net operation");
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
) => ({
  toolName: mutatePetrinautNetToolName,
  inputSchema: mutatePetrinetInputSchema,
  outputSchema: mutatePetrinetOutputSchema,
  async execute({
    input,
    mutations,
    handle,
    toolCallId,
    signal,
  }: {
    input: unknown;
    mutations: PetrinautMutations;
    handle: PetrinautDocHandle;
    toolCallId: string;
    signal: AbortSignal;
  }) {
    const request = mutatePetrinetInputSchema.parse(input);
    const beforeBatch = observeBrowserDefinition(handle);
    if (request.observation.baseHash !== beforeBatch.sha256)
      throw new Error(
        "mutate_petrinaut_net does not cite the current observed base",
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
