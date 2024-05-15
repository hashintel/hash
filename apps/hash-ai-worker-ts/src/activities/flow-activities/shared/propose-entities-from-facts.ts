import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";

import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types";
import { logger } from "../../shared/activity-logger";
import { stringify } from "../../shared/stringify";
import type { EntitySummary } from "./infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "./infer-facts-from-text/types";
import { proposeEntityFromFacts } from "./propose-entities-from-facts/propose-entity-from-facts";

export const proposeEntitiesFromFacts = async (params: {
  entitySummaries: EntitySummary[];
  facts: Fact[];
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
}): Promise<{ proposedEntities: ProposedEntity[] }> => {
  const { entitySummaries, dereferencedEntityTypes, facts } = params;

  const proposedEntities = await Promise.all(
    entitySummaries.map(async (entitySummary) => {
      const { schema: dereferencedEntityType, simplifiedPropertyTypeMappings } =
        dereferencedEntityTypes[entitySummary.entityTypeId] ?? {};

      if (!dereferencedEntityType) {
        throw new Error(
          `Could not find dereferenced entity type for entity summary: ${JSON.stringify(entitySummary)}`,
        );
      }

      if (!simplifiedPropertyTypeMappings) {
        throw new Error(
          `Could not find simplified property type mappings for entity summary: ${JSON.stringify(entitySummary)}`,
        );
      }

      const factsWithEntityAsSubject = facts.filter(
        (fact) => fact.subjectEntityLocalId === entitySummary.localId,
      );

      const proposeEntityFromFactsStatus = await proposeEntityFromFacts({
        entitySummary,
        facts: factsWithEntityAsSubject,
        dereferencedEntityType,
        simplifiedPropertyTypeMappings,
      });

      if (proposeEntityFromFactsStatus.status !== "ok") {
        logger.error(
          `Failed to propose entity from facts: ${stringify(proposeEntityFromFactsStatus)}`,
        );

        return [];
      }

      /** @todo: propose links with the entity as their source */

      const { proposedEntity } = proposeEntityFromFactsStatus;

      return proposedEntity;
    }),
  ).then((unflattenedProposedEntities) => unflattenedProposedEntities.flat());

  return { proposedEntities };
};
