import type { LocalEntitySummary } from "../../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../../shared/infer-facts-from-text/types";
import { deduplicateEntities } from "../deduplicate-entities";
import type {
  AccessedRemoteFile,
  InferFactsFromWebPageWorkerAgentState,
} from "./types";

export const updateStateFromInferredFacts = async (params: {
  state: InferFactsFromWebPageWorkerAgentState;
  inferredFacts: Fact[];
  inferredFactsAboutEntities: LocalEntitySummary[];
  filesUsedToInferFacts: AccessedRemoteFile[];
}) => {
  const {
    state,
    inferredFacts,
    inferredFactsAboutEntities,
    filesUsedToInferFacts,
  } = params;

  if (state.inferredFactsAboutEntities.length === 0) {
    /**
     * If there are no existing inferred facts about entities, there
     * is no need to deduplicate entities.
     */
    state.inferredFactsAboutEntities = inferredFactsAboutEntities;
    state.inferredFacts = inferredFacts;
  } else {
    const { duplicates } = await deduplicateEntities({
      entities: [
        ...inferredFactsAboutEntities,
        ...state.inferredFactsAboutEntities,
      ],
    });

    const inferredFactsWithDeduplicatedEntities = inferredFacts.map((fact) => {
      const { subjectEntityLocalId, objectEntityLocalId } = fact;
      const subjectDuplicate = duplicates.find(({ duplicateIds }) =>
        duplicateIds.includes(subjectEntityLocalId),
      );

      const objectDuplicate = objectEntityLocalId
        ? duplicates.find(({ duplicateIds }) =>
            duplicateIds.includes(objectEntityLocalId),
          )
        : undefined;

      return {
        ...fact,
        subjectEntityLocalId:
          subjectDuplicate?.canonicalId ?? fact.subjectEntityLocalId,
        objectEntityLocalId:
          objectDuplicate?.canonicalId ?? objectEntityLocalId,
      };
    });

    state.inferredFacts.push(...inferredFactsWithDeduplicatedEntities);
    state.inferredFactsAboutEntities = [
      ...state.inferredFactsAboutEntities,
      ...inferredFactsAboutEntities,
    ].filter(
      ({ localId }) =>
        !duplicates.some(({ duplicateIds }) => duplicateIds.includes(localId)),
    );
  }

  state.filesUsedToInferFacts = [
    ...state.filesUsedToInferFacts,
    ...filesUsedToInferFacts,
  ].filter(
    ({ url }, index, all) =>
      all.findIndex((file) => file.url === url) === index,
  );
};
