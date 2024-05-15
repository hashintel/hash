import type { VersionedUrl } from "@blockprotocol/type-system";

import { getDereferencedEntityTypesActivity } from "../../get-dereferenced-entity-types-activity";
import { logger } from "../../shared/activity-logger";
import { getFlowContext } from "../../shared/get-flow-context";
import { graphApiClient } from "../../shared/graph-api-client";
import { stringify } from "../../shared/stringify";
import type { EntitySummary } from "./infer-facts-from-text/get-entity-summaries-from-text";
import { getEntitySummariesFromText } from "./infer-facts-from-text/get-entity-summaries-from-text";
import { inferEntityFactsFromText } from "./infer-facts-from-text/infer-entity-facts-from-text";
import type { Fact } from "./infer-facts-from-text/types";

export const inferFactsFromText = async (params: {
  text: string;
  entityTypeIds: VersionedUrl[];
  testingParams?: {
    existingEntitySummaries?: EntitySummary[];
  };
}): Promise<{
  facts: Fact[];
  entitySummaries: EntitySummary[];
}> => {
  const { text, testingParams, entityTypeIds } = params;

  const { userAuthentication } = await getFlowContext();

  const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
    entityTypeIds,
    graphApiClient,
    actorId: userAuthentication.actorId,
    simplifyPropertyKeys: true,
  });

  const entitySummaries: EntitySummary[] =
    testingParams?.existingEntitySummaries ??
    (await Promise.all(
      Object.values(dereferencedEntityTypes)
        /**
         * We only extract the entity summaries for entities, not links.
         */
        .filter(({ isLink }) => !isLink)
        .map(async ({ schema }) => {
          const { entitySummaries: entitySummariesOfType } =
            await getEntitySummariesFromText({
              text,
              dereferencedEntityType: schema,
            });

          return entitySummariesOfType;
        }),
    ).then((unflattenedEntitySummaries) => unflattenedEntitySummaries.flat()));

  const aggregatedFacts: Fact[] = await Promise.all(
    entitySummaries.map(async (entitySummary) => {
      logger.debug(`Inferring facts for entity: ${stringify(entitySummary)}`);

      const dereferencedEntityType =
        dereferencedEntityTypes[entitySummary.entityTypeId]?.schema;

      if (!dereferencedEntityType) {
        throw new Error(
          `Could not find dereferenced entity type for entity summary: ${stringify(
            entitySummary,
          )}`,
        );
      }

      const { facts } = await inferEntityFactsFromText({
        subjectEntity: entitySummary,
        /**
         * Note: we could reduce the number of potential object entities by filtering out
         * all entities which don't have a type that the subject entity can link to. This
         * would result in missed facts, so is not being done at the moment but could be
         * considered in the future.
         */
        potentialObjectEntities: entitySummaries.filter(
          ({ localId }) => localId !== entitySummary.localId,
        ),
        text,
        dereferencedEntityType,
      });

      return facts;
    }),
  ).then((unflattenedFacts) => unflattenedFacts.flat());

  return { facts: aggregatedFacts, entitySummaries };
};
