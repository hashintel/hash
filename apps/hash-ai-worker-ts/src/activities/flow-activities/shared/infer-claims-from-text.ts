import type { VersionedUrl } from "@blockprotocol/type-system";

import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types.js";
import { logger } from "../../shared/activity-logger.js";
import type { LocalEntitySummary } from "./infer-claims-from-text/get-entity-summaries-from-text.js";
import { getEntitySummariesFromText } from "./infer-claims-from-text/get-entity-summaries-from-text.js";
import { inferEntityClaimsFromTextAgent } from "./infer-claims-from-text/infer-entity-claims-from-text-agent.js";
import type { Claim } from "./infer-claims-from-text/types.js";

export const inferClaimsFromText = async (params: {
  text: string;
  url: string | null;
  title: string | null;
  contentType: "webpage" | "document";
  existingEntitiesOfInterest: LocalEntitySummary[];
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
  goal: string;
  testingParams?: {
    existingEntitySummaries?: LocalEntitySummary[];
  };
}): Promise<{
  claims: Claim[];
  entitySummaries: LocalEntitySummary[];
}> => {
  const {
    text,
    title,
    url,
    contentType,
    existingEntitiesOfInterest,
    testingParams,
    dereferencedEntityTypes,
    goal,
  } = params;

  const newEntitySummaries: LocalEntitySummary[] =
    testingParams?.existingEntitySummaries ??
    (
      await Promise.all(
        Object.values(dereferencedEntityTypes)
          /**
           * We only extract the entity summaries for entities, not links.
           */
          .filter(({ isLink }) => !isLink)
          .map(async ({ schema }) => {
            const { entitySummaries: entitySummariesOfType } =
              await getEntitySummariesFromText({
                existingSummaries: existingEntitiesOfInterest,
                text,
                dereferencedEntityType: schema,
                relevantEntitiesPrompt: goal,
              });

            return entitySummariesOfType;
          }),
      ).then((unflattenedEntitySummaries) => unflattenedEntitySummaries.flat())
    ).filter(
      (newSummary) =>
        !existingEntitiesOfInterest.some(
          (inputSummary) => inputSummary.name === newSummary.name,
        ),
    );

  const entitySummariesForInferenceByType = [
    ...newEntitySummaries,
    ...existingEntitiesOfInterest,
  ].reduce(
    (prev, currentEntitySummary) => {
      const { entityTypeId } = currentEntitySummary;

      return {
        ...prev,
        [entityTypeId]: [...(prev[entityTypeId] ?? []), currentEntitySummary],
      };
    },
    {} as Record<VersionedUrl, LocalEntitySummary[]>,
  );

  const aggregatedClaims: Claim[] = await Promise.all(
    Object.entries(entitySummariesForInferenceByType).map(
      async ([entityTypeId, entitySummariesOfType]) => {
        logger.debug(
          `Inferring claims for ${entitySummariesOfType.length} entity summaries of type: ${entityTypeId}`,
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
            const { claims: claimsForSingleEntity } =
              await inferEntityClaimsFromTextAgent({
                subjectEntities: [entity],
                linkEntityTypesById: Object.fromEntries(
                  Object.entries(dereferencedEntityTypes)
                    .filter(([linkEntityTypeId]) =>
                      Object.keys(dereferencedEntityType.links ?? {}).includes(
                        linkEntityTypeId,
                      ),
                    )
                    .map(([linkEntityTypeId, linkEntity]) => [
                      linkEntityTypeId,
                      linkEntity.schema,
                    ]),
                ),
                potentialObjectEntities: [
                  ...newEntitySummaries,
                  ...existingEntitiesOfInterest,
                ],
                goal,
                text,
                title,
                url,
                contentType,
                dereferencedEntityType,
              });

            return claimsForSingleEntity;
          }),
        ).then((unflattenedClaims) => unflattenedClaims.flat());
      },
    ),
  ).then((unflattenedClaims) => unflattenedClaims.flat());

  return { claims: aggregatedClaims, entitySummaries: newEntitySummaries };
};
