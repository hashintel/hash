import type { JsonObject } from "@blockprotocol/core";
import { validateVersionedUrl, VersionedUrl } from "@blockprotocol/type-system";
import { Subtype } from "@local/advanced-types/subtype";
import { BaseUrl, EntityPropertyValue } from "@local/hash-subgraph";
import OpenAI from "openai";
import { JSONSchema } from "openai/lib/jsonschema";

import { DereferencedEntityType } from "./dereference-entity-type";

export type FunctionName = "could_not_infer_entities" | "create_entities";

type ProposedEntitySchemaOrData = {
  entityId: unknown;
  properties: unknown;
} & ({} | { sourceEntityId: unknown; targetEntityId: unknown });

export type ProposedEntity = Subtype<
  ProposedEntitySchemaOrData,
  {
    entityId: number;
    properties: Record<BaseUrl, EntityPropertyValue>;
  } & (
    | {}
    | {
        sourceEntityId: number;
        targetEntityId: number;
      }
  )
>;

export type ProposedEntitiesByType = Record<VersionedUrl, ProposedEntity[]>;

/**
 * Validates that the provided object is a valid ProposedEntitiesByType object.
 * @throws Error if the provided object does not match ProposedEntitiesByType
 */
export const validateProposedEntitiesByType = (
  parsedJson: JsonObject,
): parsedJson is ProposedEntitiesByType => {
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

  const maybeEntitiesArrays = Object.values(parsedJson);

  const invalidArrays = maybeEntitiesArrays.filter((maybeEntitiesArray) => {
    return !Array.isArray(maybeEntitiesArray);
  });

  if (invalidArrays.length > 0) {
    throw new Error(
      `Invalid entities arrays in AI-provided response: ${JSON.stringify(
        invalidArrays.join(", "),
      )}`,
    );
  }

  const invalidEntities = maybeEntitiesArrays
    .flat()
    .filter((maybeEntity): maybeEntity is ProposedEntity => {
      if (
        maybeEntity === null ||
        typeof maybeEntity !== "object" ||
        Array.isArray(maybeEntity)
      ) {
        return true;
      }

      if (!("entityId" in maybeEntity && "properties" in maybeEntity)) {
        return true;
      }

      if (
        ("sourceEntityId" in maybeEntity &&
          !("targetEntityId" in maybeEntity)) ||
        (!("sourceEntityId" in maybeEntity) && "targetEntityId" in maybeEntity)
      ) {
        return true;
      }

      return false;
    });

  if (invalidEntities.length > 0) {
    throw new Error(
      `Invalid entities in AI-provided response: ${JSON.stringify(
        invalidEntities.join(", "),
      )}`,
    );
  }

  return true;
};

export const generateFunctions = (
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
        reason: {
          type: "string",
          description:
            "A brief explanation as to why no entities could have been inferred, and one suggestion on how to fix the issue",
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_entities" satisfies FunctionName,
      description: "Create entities inferred from the provided text",
      parameters: {
        type: "object",
        properties: entityTypes.reduce<Record<VersionedUrl, JSONSchema>>(
          (acc, { schema, isLink }) => {
            acc[schema.$id] = {
              type: "array",
              title: `${schema.title} entities`,
              items: {
                $id: schema.$id,
                type: "object",
                title: schema.title,
                description: schema.description,
                properties: {
                  entityId: {
                    description:
                      "A numerical identifier for the entity, unique among the inferred entities",
                    type: "number",
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
                  properties: schema.properties,
                } satisfies ProposedEntitySchemaOrData,
                required: [
                  "entityId",
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
