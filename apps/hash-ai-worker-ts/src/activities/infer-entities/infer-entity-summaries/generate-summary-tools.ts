import type { JsonObject } from "@blockprotocol/core";
import { validateVersionedUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import OpenAI from "openai";
import type { JSONSchema } from "openai/lib/jsonschema";

import { DereferencedEntityType } from "../dereference-entity-type";
import { ProposedEntitySummary } from "../inference-types";

type FunctionName = "could_not_infer_entities" | "register_entity_summaries";

export type ProposedEntitySummariesByType = Record<
  VersionedUrl,
  Omit<ProposedEntitySummary, "entityTypeId">[]
>;

const stringifyArray = (array: unknown[]): string =>
  array.map((item) => JSON.stringify(item)).join(", ");

/**
 * Validates that the provided object is a valid ProposedEntitiesByType object.
 * @throws Error if the provided object does not match ProposedEntitiesByType
 */
export const validateEntitySummariesByType = (
  parsedJson: JsonObject,
): parsedJson is ProposedEntitySummariesByType => {
  const maybeVersionedUrls = Object.keys(parsedJson);

  const invalidVersionedUrls = maybeVersionedUrls.filter(
    (maybeVersionedUrl) => {
      const result = validateVersionedUrl(maybeVersionedUrl);

      return result.type !== "Ok";
    },
  );

  if (invalidVersionedUrls.length > 0) {
    throw new Error(
      `Invalid versionedUrls in AI-provided response: ${invalidVersionedUrls.join(
        ", ",
      )}`,
    );
  }

  const maybeEntitySummariesArrays = Object.values(parsedJson);

  const invalidArrays = maybeEntitySummariesArrays.filter(
    (maybeEntitySummariesArray) => {
      return !Array.isArray(maybeEntitySummariesArray);
    },
  );

  if (invalidArrays.length > 0) {
    throw new Error(
      `Invalid entities arrays in AI-provided response: ${stringifyArray(
        invalidArrays,
      )}`,
    );
  }

  const invalidEntities = maybeEntitySummariesArrays
    .flat()
    .filter((maybeEntitySummary) => {
      if (
        maybeEntitySummary === null ||
        typeof maybeEntitySummary !== "object" ||
        Array.isArray(maybeEntitySummary)
      ) {
        return true;
      }

      if (typeof maybeEntitySummary.entityId !== "number") {
        return true;
      }

      if (typeof maybeEntitySummary.summary !== "string") {
        return true;
      }

      if (
        ("sourceEntityId" in maybeEntitySummary &&
          !("targetEntityId" in maybeEntitySummary)) ||
        (!("sourceEntityId" in maybeEntitySummary) &&
          "targetEntityId" in maybeEntitySummary)
      ) {
        return true;
      }

      return false;
    });

  if (invalidEntities.length > 0) {
    throw new Error(
      `Invalid entities in AI-provided response: ${stringifyArray(
        invalidEntities,
      )}`,
    );
  }

  return true;
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
