import type { JsonObject } from "@blockprotocol/core";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { validateVersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type OpenAI from "openai";
import type { JSONSchema } from "openai/lib/jsonschema";

import type { DereferencedEntityType } from "../dereference-entity-type";
import type {
  DereferencedEntityTypesByTypeId,
  ProposedEntitySummary,
} from "../inference-types";
import { stringify } from "../stringify";

type FunctionName = "could_not_infer_entities" | "register_entity_summaries";

export type ProposedEntitySummariesByType = Record<
  VersionedUrl,
  Omit<ProposedEntitySummary, "entityTypeId">[]
>;

/**
 * Validates that the provided object is a valid ProposedEntitiesByType object.
 * @throws Error if the provided object does not match ProposedEntitiesByType
 */
export const validateEntitySummariesByType = (
  parsedJson: JsonObject,
  entityTypesById: DereferencedEntityTypesByTypeId,
  existingSummaries: ProposedEntitySummary[],
): {
  errorMessage?: string;
  validSummaries: ProposedEntitySummary[];
} => {
  const errorMessages: string[] = [];

  const validSummariesWithLinksUnchecked: ProposedEntitySummary[] = [
    ...existingSummaries,
  ];

  for (const [entityTypeId, summaryEntitiesForType] of typedEntries(
    parsedJson,
  )) {
    const typeIdValidationResult = validateVersionedUrl(entityTypeId);

    if (typeIdValidationResult.type !== "Ok") {
      errorMessages.push(
        `The value '${stringify(
          entityTypeId,
        )}' for entityTypeId is not a valid versionedUrl`,
      );
      continue;
    }

    const entityType = entityTypesById[entityTypeId as VersionedUrl];
    if (!entityType) {
      errorMessages.push(
        `Call to register_entity_summaries for unknown entity type ${entityTypeId}`,
      );
      continue;
    }

    if (!Array.isArray(summaryEntitiesForType)) {
      errorMessages.push(
        `The value '${stringify(
          summaryEntitiesForType,
        )}' for '${entityTypeId}' is not an array, but should be`,
      );
      continue;
    }

    for (const entitySummary of summaryEntitiesForType) {
      if (
        entitySummary === null ||
        typeof entitySummary !== "object" ||
        Array.isArray(entitySummary)
      ) {
        errorMessages.push(`Malformed entity ${stringify(entitySummary)}`);
        continue;
      }

      let currentEntityIsValid = true;

      if (typeof entitySummary.entityId !== "number") {
        errorMessages.push(
          `entityId must be a number, but is ${stringify(
            entitySummary.entityId,
          )}`,
        );
        currentEntityIsValid = false;
      }

      if (typeof entitySummary.summary !== "string") {
        errorMessages.push(
          `summary for entity with id ${stringify(
            entitySummary.entityId,
          )} must be a string, but is ${stringify(entitySummary.summary)}`,
        );
        currentEntityIsValid = false;
      }

      if (currentEntityIsValid) {
        validSummariesWithLinksUnchecked.push({
          entityId: entitySummary.entityId as number,
          summary: entitySummary.summary as string,
          sourceEntityId: entitySummary.sourceEntityId as number | undefined,
          targetEntityId: entitySummary.targetEntityId as number | undefined,
          entityTypeId: entityTypeId as VersionedUrl,
        });
      }
    }
  }

  const validSummaries: ProposedEntitySummary[] = [];

  for (const potentiallyLinkEntity of validSummariesWithLinksUnchecked) {
    const entityType = entityTypesById[potentiallyLinkEntity.entityTypeId]!;
    if (!entityType.isLink) {
      validSummaries.push(potentiallyLinkEntity);
    } else {
      if (
        typeof potentiallyLinkEntity.sourceEntityId !== "number" ||
        typeof potentiallyLinkEntity.targetEntityId !== "number"
      ) {
        errorMessages.push(
          `Link entity with entityId ${stringify(
            potentiallyLinkEntity,
          )} must have number values for both sourceEntityId and targetEntityId`,
        );
        continue;
      }

      const source = validSummariesWithLinksUnchecked.find(
        (entity) => entity.entityId === potentiallyLinkEntity.sourceEntityId,
      );
      const target = validSummariesWithLinksUnchecked.find(
        (entity) => entity.entityId === potentiallyLinkEntity.targetEntityId,
      );

      if (!source) {
        errorMessages.push(
          `Link entity with entityId ${potentiallyLinkEntity.entityId} specifies invalid sourceEntityId ${potentiallyLinkEntity.sourceEntityId} that does not correspond to any other valid entity – please include a valid entity with that entityId in your next attempt.`,
        );
      }
      if (!target) {
        errorMessages.push(
          `Link entity with entityId ${potentiallyLinkEntity.entityId} specifies invalid targetEntityId ${potentiallyLinkEntity.targetEntityId} that does not correspond to any other valid entity – please include a valid entity with that entityId in your next attempt.`,
        );
      }
      if (source && target) {
        validSummaries.push(potentiallyLinkEntity);
      }
    }
  }

  return {
    errorMessage:
      errorMessages.length > 0 ? errorMessages.join("\n") : undefined,
    validSummaries,
  };
};

type CouldNotInferEntitiesReturnKey = "reason";
type CouldNotInferEntitiesSchemaOrObject = Record<
  CouldNotInferEntitiesReturnKey,
  unknown
>;

export type CouldNotInferEntitiesReturn = Subtype<
  CouldNotInferEntitiesSchemaOrObject,
  {
    reason: string;
  }
>;

export const generateSummaryTools = (
  entityTypes: {
    schema: DereferencedEntityType;
    isLink: boolean;
  }[],
): OpenAI.Chat.Completions.ChatCompletionTool[] => [
  {
    type: "function",
    function: {
      name: "could_not_infer_entities" satisfies FunctionName,
      description:
        "Returns a warning to the user explaining why no entities could have been inferred from the provided text",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description:
              "A brief explanation as to why no entities could have been inferred, and one suggestion on how to fix the issue",
          },
        } satisfies CouldNotInferEntitiesSchemaOrObject,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "register_entity_summaries" satisfies FunctionName,
      description:
        "Register a short summary for each entity that can be inferred from the providing text",
      parameters: {
        type: "object",
        properties: entityTypes.reduce<Record<VersionedUrl, JSONSchema>>(
          (acc, { schema, isLink }) => {
            acc[schema.$id] = {
              type: "array",
              title: `Summaries of entities of type ${
                schema.title
              } that can be inferred from the provided text.${
                isLink
                  ? "This is a link type, which must link two other entities together by reference to their entityIds as source and target."
                  : ""
              }`,
              items: {
                $id: schema.$id,
                type: "object",
                title: schema.title,
                description: schema.description,
                properties: {
                  entityId: {
                    description:
                      "Your numerical identifier for the entity, unique among the inferred entities in this conversation",
                    type: "number",
                  },
                  summary: {
                    description:
                      "A short summary of the entity that can be used to uniquely identify it in the provided text. It need not be human-readable or user-friendly, it is only for use by AI Assistants.",
                    type: "string",
                  },
                  ...(isLink
                    ? {
                        sourceEntityId: {
                          description:
                            "The entityId of the source entity of the link",
                          type: "number",
                        },
                        targetEntityId: {
                          description:
                            "The entityId of the target entity of the link",
                          type: "number",
                        },
                      }
                    : {}),
                },
                required: [
                  "entityId",
                  "summary",
                  ...(isLink ? ["sourceEntityId", "targetEntityId"] : []),
                ],
              },
            };
            return acc;
          },
          {},
        ),
      },
    },
  },
];
