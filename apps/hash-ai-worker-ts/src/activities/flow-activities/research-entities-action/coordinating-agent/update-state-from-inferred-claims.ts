import type { EntityId } from "@local/hash-graph-types/entity";
import type { WorkerIdentifiers } from "@local/hash-isomorphic-utils/flows/types";
import { isNotNullish } from "@local/hash-isomorphic-utils/types";

import type { LocalEntitySummary } from "../../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../../shared/infer-summaries-then-claims-from-text/types.js";
import { proposeEntitiesFromClaims } from "../../shared/propose-entities-from-claims.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "../shared/coordinators.js";
import {
  deduplicateEntities,
  type DuplicateReport,
} from "../shared/deduplicate-entities.js";

const adjustDuplicates = (params: {
  duplicates: DuplicateReport[];
  entityIdsWhichCannotBeDeduplicated: EntityId[];
}) => {
  const { duplicates, entityIdsWhichCannotBeDeduplicated } = params;

  const adjustedDuplicates = duplicates.map<DuplicateReport>(
    ({ canonicalId, duplicateIds }) => {
      if (entityIdsWhichCannotBeDeduplicated.includes(canonicalId)) {
        return { canonicalId, duplicateIds };
      }

      const existingEntityIdMarkedAsDuplicate = duplicateIds.find((id) =>
        entityIdsWhichCannotBeDeduplicated.includes(id),
      );

      /**
       * @todo: this doesn't account for when there are duplicates
       * detected in the existing entities.
       */
      if (existingEntityIdMarkedAsDuplicate) {
        return {
          canonicalId: existingEntityIdMarkedAsDuplicate,
          duplicateIds: [
            ...duplicateIds.filter(
              (id) => id !== existingEntityIdMarkedAsDuplicate,
            ),
            canonicalId,
          ],
        };
      }

      return { canonicalId, duplicateIds };
    },
  );

  return adjustedDuplicates;
};
/**
 * Given newly discovered claims and entity summaries:
 * 1. Deduplicate entities
 * 2. Update the state with the new claims and entity summaries
 * 3. Create or update proposals for (1) new entities and (2) existing entities with new claims
 * 4. Update the state with the new and updated proposals
 */
export const updateStateFromInferredClaims = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  newClaims: Claim[];
  newEntitySummaries: LocalEntitySummary[];
  workerIdentifiers: WorkerIdentifiers;
}) => {
  const { input, state, newEntitySummaries, newClaims, workerIdentifiers } =
    params;

  /**
   * Step 1: Deduplication (if necessary)
   */

  const canonicalEntityIdsForNewDuplicates: string[] = [];
  if (newEntitySummaries.length === 0) {
    // do nothing – there are no new entities to deduplicate
  } else {
    /**
     * We need to deduplicate newly discovered entities (which may contain duplicates within them)
     * alongside any existing entities.
     */
    const { duplicates } = await deduplicateEntities({
      entities: [
        ...(input.existingEntitySummaries ?? []),
        ...newEntitySummaries,
        ...state.entitySummaries,
      ],
    });

    /**
     * There are some entities that shouldn't be marked as the duplicates, and
     * should instead always be the canonical entity.
     */
    const entityIdsWhichCannotBeDeduplicated = [
      /**
       * We don't want to deduplicate any entities that are already persisted in
       * the graph (i.e. the `existingEntities` passed in as input to the action)
       */
      ...(input.existingEntitySummaries ?? []).map(({ entityId }) => entityId),
    ];

    const adjustedDuplicates = adjustDuplicates({
      duplicates,
      entityIdsWhichCannotBeDeduplicated,
    });

    canonicalEntityIdsForNewDuplicates.push(
      ...adjustedDuplicates.map(({ canonicalId }) => canonicalId),
    );

    const inferredClaimsWithDeduplicatedEntities = newClaims.map((claim) => {
      const { subjectEntityLocalId, objectEntityLocalId } = claim;
      const subjectDuplicate = adjustedDuplicates.find(({ duplicateIds }) =>
        duplicateIds.includes(subjectEntityLocalId),
      );

      const objectDuplicate = objectEntityLocalId
        ? duplicates.find(({ duplicateIds }) =>
            duplicateIds.includes(objectEntityLocalId),
          )
        : undefined;

      return {
        ...claim,
        subjectEntityLocalId:
          subjectDuplicate?.canonicalId ?? claim.subjectEntityLocalId,
        objectEntityLocalId:
          objectDuplicate?.canonicalId ?? objectEntityLocalId,
      };
    });

    state.inferredClaims.push(...inferredClaimsWithDeduplicatedEntities);
    state.entitySummaries = [
      ...state.entitySummaries,
      ...newEntitySummaries,
    ].filter(
      ({ localId }) =>
        !duplicates.some(({ duplicateIds }) => duplicateIds.includes(localId)),
    );

    /**
     * Account for any previously proposed entities with a local ID which has
     * been marked as a duplicate.
     */
    state.proposedEntities = state.proposedEntities
      .map((proposedEntity) => {
        const duplicate = duplicates.find(({ duplicateIds }) =>
          duplicateIds.includes(proposedEntity.localEntityId),
        );

        return duplicate ? null : proposedEntity;
      })
      .filter(isNotNullish);
  }

  /**
   * Step 2: Create or update proposals for new entities and existing entities with new claims
   */

  /**
   * We want to (re)propose entities which may have new information, via one of:
   * 1. Appearing as a new summary
   * 2. Being the subject or object of a new claim
   * 3. Having been identified as the canonical version of a new duplicate (which means it may have had new claims
   * discovered)
   */
  const entityIdsToPropose = [
    ...new Set([
      ...newEntitySummaries.map(({ localId }) => localId),
      ...newClaims.flatMap(({ subjectEntityLocalId, objectEntityLocalId }) =>
        [subjectEntityLocalId, objectEntityLocalId].filter(isNotNullish),
      ),
      ...canonicalEntityIdsForNewDuplicates,
    ]),
  ];

  /**
   * Gather the claims which relate to the entities that are being proposed
   */
  const entitySummaries = state.entitySummaries.filter(({ localId }) =>
    entityIdsToPropose.includes(localId),
  );

  const relevantClaims = state.inferredClaims.filter(
    ({ subjectEntityLocalId, objectEntityLocalId }) =>
      entityIdsToPropose.includes(subjectEntityLocalId) ||
      /**
       * Claims where the entity is the object may contain information which is useful in constructing it,
       * or a link from it – the claim may be expressed in the reverse direction to that of the target entity types.
       */
      (objectEntityLocalId && entityIdsToPropose.includes(objectEntityLocalId)),
  );

  /**
   * Given the affected entities, we also need the summaries of entities they may link to.
   */
  const potentialLinkTargetEntitySummaries = state.entitySummaries.filter(
    ({ localId }) =>
      relevantClaims.some(
        ({ objectEntityLocalId }) => localId === objectEntityLocalId,
      ),
  );

  /**
   * Get the updated proposals
   */
  const { proposedEntities: newProposedEntities } =
    await proposeEntitiesFromClaims({
      dereferencedEntityTypes: input.allDereferencedEntityTypesById,
      entitySummaries,
      existingEntitySummaries: input.existingEntitySummaries,
      claims: relevantClaims,
      potentialLinkTargetEntitySummaries,
      workerIdentifiers,
    });

  state.proposedEntities = [
    /**
     * Filter out any previous proposed entities that have been re-proposed with new claims.
     */
    ...state.proposedEntities.filter(
      ({ localEntityId }) =>
        !newProposedEntities.some(
          (newProposedEntity) =>
            newProposedEntity.localEntityId === localEntityId,
        ),
    ),
    ...newProposedEntities,
  ];
};
