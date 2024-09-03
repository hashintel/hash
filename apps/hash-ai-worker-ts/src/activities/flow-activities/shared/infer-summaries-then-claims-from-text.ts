import type { VersionedUrl } from "@blockprotocol/type-system";
import type { WorkerIdentifiers } from "@local/hash-isomorphic-utils/flows/types";

import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types.js";
import { logger } from "../../shared/activity-logger.js";
import type { LlmParams } from "../../shared/get-llm-response/types.js";
import type { LocalEntitySummary } from "./infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import { getEntitySummariesFromText } from "./infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import { inferEntityClaimsFromTextAgent } from "./infer-summaries-then-claims-from-text/infer-entity-claims-from-text-agent.js";
import type { Claim } from "./claims.js";

/**
 * A two-step process for extracting claims about entities from text:
 * 1. Infer a list of named entities relevant to the research brief from the text
 * 2. Infer claims about each of the discovered entities (as well as any other existingEntitiesOfInterest)
 */
export const inferSummariesThenClaimsFromText = async (params: {
  /**
   * The content to extract claims from.
   */
  text: string;
  /**
   * The URL the content was retrieved from, which may itself be relevant to the claims.
   * e.g. if a desired attribute if someone's LinkedIn URL, the URL itself may be relevant.
   */
  url: string | null;
  /**
   * The title of the webpage or document, which may itself provide useful context for entity or claim recognition.
   */
  title: string | null;
  /**
   * The type of content being processed.
   */
  contentType: "webpage" | "document";
  /**
   * Any entities which are already known of, and should be considered in the claim extraction process.
   * Providing these avoids the entity recognition process identifying duplicate entities which need consolidation
   * later.
   */
  existingEntitiesOfInterest: LocalEntitySummary[];
  /**
   * All types of entities which are sought as part of the research task.
   * Even if the specific current goal is to find claims about a particular entity type (e.g. Company),
   * other entity types may be relevant to the research goal (e.g. linked Persons or Locations).
   */
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
  /**
   * The research goal, which helps to cut down on noise in the entity recognition process.
   */
  goal: string;
  /**
   * The identifiers for the worker this agent is operating in.
   */
  workerIdentifiers: WorkerIdentifiers;
  /**
   * Optional parameters for optimization purposes, allowing to overwrite the model used.
   */
  testingParams?: {
    model?: LlmParams["model"];
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
    dereferencedEntityTypes,
    goal,
    testingParams,
    workerIdentifiers,
  } = params;

  const { entitySummaries: newEntitySummaries } =
    await getEntitySummariesFromText({
      existingSummaries: existingEntitiesOfInterest,
      text,
      dereferencedEntityTypes: Object.values(dereferencedEntityTypes).map(
        (type) => type.schema,
      ),
      relevantEntitiesPrompt: goal,
      testingParams,
    });

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
                workerIdentifiers,
              });

            return claimsForSingleEntity;
          }),
        ).then((unflattenedClaims) => unflattenedClaims.flat());
      },
    ),
  ).then((unflattenedClaims) => unflattenedClaims.flat());

  return { claims: aggregatedClaims, entitySummaries: newEntitySummaries };
};
