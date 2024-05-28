import type { VersionedUrl } from "@blockprotocol/type-system";

import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types";
import { logger } from "../../shared/activity-logger";
import type { LocalEntitySummary } from "./infer-facts-from-text/get-entity-summaries-from-text";
import { getEntitySummariesFromText } from "./infer-facts-from-text/get-entity-summaries-from-text";
import { inferEntityFactsFromText } from "./infer-facts-from-text/infer-entity-facts-from-text";
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

        const maximumNumberOfParallelizedRequests = 3;

        const facts: Fact[] = [];

        const chunks = entitySummariesOfType.reduce<LocalEntitySummary[][]>(
          (previousArray, item, index) => {
            const chunkIndex = Math.floor(
              index / maximumNumberOfParallelizedRequests,
            );

            const resultArray = previousArray;

            if (!resultArray[chunkIndex]) {
              return [...resultArray, [item]];
            }

            return [
              ...resultArray.slice(0, chunkIndex),
              [...(resultArray[chunkIndex] ?? []), item],
            ];
          },
          [],
        );

        /**
         * Parallelize the facts for entities in chunks, to reduce risk of hitting rate limits.
         *
         * @todo: implement more robust strategy for dealing with rate limits
         * @see https://linear.app/hash/issue/H-2787/handle-rate-limits-gracefully-particularly-when-gathering-facts-for
         */
        for (const chunk of chunks) {
          const chunkResults = await Promise.all(
            chunk.map(async (entity) => {
              const { facts: factsForSingleEntity } =
                await inferEntityFactsFromText({
                  subjectEntities: [entity],
                  potentialObjectEntities: entitySummaries,
                  text,
                  dereferencedEntityType,
                });
              return factsForSingleEntity;
            }),
          );

          facts.push(...chunkResults.flat());
        }

        return facts;
      },
    ),
  ).then((unflattenedFacts) => unflattenedFacts.flat());

  return { facts: aggregatedFacts, entitySummaries };
};
