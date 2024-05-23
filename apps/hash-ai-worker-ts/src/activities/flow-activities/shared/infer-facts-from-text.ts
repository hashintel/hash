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

        const numberOfEntitySummariesPerRequest = 5;

        const chunkedSubjectEntities = entitySummariesOfType.reduce<
          LocalEntitySummary[][]
        >((result, item, index) => {
          const chunkIndex = Math.floor(
            index / numberOfEntitySummariesPerRequest,
          );

          return [
            ...result.slice(0, chunkIndex),
            [...(result[chunkIndex] ?? []), item],
          ];
        }, []);

        const factsObtainedPerChunk = await Promise.all(
          chunkedSubjectEntities.map(async (subjectEntities) => {
            const { facts } = await inferEntityFactsFromText({
              subjectEntities,
              /**
               * Note: we could reduce the number of potential object entities by filtering out
               * all entities which don't have a type that the subject entity can link to. This
               * would result in missed facts, so is not being done at the moment but could be
               * considered in the future.
               */
              potentialObjectEntities: entitySummaries,
              text,
              dereferencedEntityType,
            });

            return facts;
          }),
        );

        return factsObtainedPerChunk.flat();
      },
    ),
  ).then((unflattenedFacts) => unflattenedFacts.flat());

  return { facts: aggregatedFacts, entitySummaries };
};
