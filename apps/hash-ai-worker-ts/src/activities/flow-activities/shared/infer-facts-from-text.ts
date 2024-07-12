import type { VersionedUrl } from "@blockprotocol/type-system";

import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types";
import { logger } from "../../shared/activity-logger";
import type { LocalEntitySummary } from "./infer-facts-from-text/get-entity-summaries-from-text";
import { getEntitySummariesFromText } from "./infer-facts-from-text/get-entity-summaries-from-text";
import { inferEntityFactsFromTextAgent } from "./infer-facts-from-text/infer-entity-facts-from-text-agent";
import type { Fact } from "./infer-facts-from-text/types";

export const inferFactsFromText = async (params: {
  text: string;
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
  relevantEntitiesPrompt?: string;
  testingParams?: {
    existingEntitySummaries?: LocalEntitySummary[];
  };
}): Promise<{
  facts: Fact[];
  entitySummaries: LocalEntitySummary[];
}> => {
  const {
    text,
    testingParams,
    dereferencedEntityTypes,
    relevantEntitiesPrompt,
  } = params;

  const entitySummaries: LocalEntitySummary[] =
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
              relevantEntitiesPrompt,
            });

          return entitySummariesOfType;
        }),
    ).then((unflattenedEntitySummaries) => unflattenedEntitySummaries.flat()));

  const entitySummariesByType = entitySummaries.reduce(
    (prev, currentEntitySummary) => {
      const { entityTypeId } = currentEntitySummary;

      return {
        ...prev,
        [entityTypeId]: [...(prev[entityTypeId] ?? []), currentEntitySummary],
      };
    },
    {} as Record<VersionedUrl, LocalEntitySummary[]>,
  );

  const aggregatedFacts: Fact[] = await Promise.all(
    Object.entries(entitySummariesByType).map(
      async ([entityTypeId, entitySummariesOfType]) => {
        logger.debug(
          `Inferring facts for ${entitySummariesOfType.length} entity summaries of type: ${entityTypeId}`,
        );

        const dereferencedEntityType =
          dereferencedEntityTypes[entityTypeId as VersionedUrl]?.schema;

        if (!dereferencedEntityType) {
          throw new Error(
            `Could not find dereferenced entity type for entity summaries: ${entityTypeId}`,
          );
        }

        return await Promise.all(
          entitySummariesOfType.map(async (entity) => {
            const { facts: factsForSingleEntity } =
              await inferEntityFactsFromTextAgent({
                subjectEntities: [entity],
                potentialObjectEntities: entitySummaries,
                text,
                dereferencedEntityType,
              });

            return factsForSingleEntity;
          }),
        ).then((unflattenedFacts) => unflattenedFacts.flat());
      },
    ),
  ).then((unflattenedFacts) => unflattenedFacts.flat());

  return { facts: aggregatedFacts, entitySummaries };
};
