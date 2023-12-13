import type { JsonObject } from "@blockprotocol/core";
import { validateVersionedUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import {
  ProposedEntity,
  ProposedEntitySchemaOrData,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { Entity } from "@local/hash-subgraph";
import dedent from "dedent";
import OpenAI from "openai";
import type { JSONSchema } from "openai/lib/jsonschema";

import { DereferencedEntityType } from "./dereference-entity-type";

export type FunctionName =
  | "could_not_infer_entities"
  | "create_entities"
  | "update_entities";

export type ProposedEntityCreationsByType = Record<
  VersionedUrl,
  ProposedEntity[]
>;

export type ProposedEntityUpdatesByType = Record<
  VersionedUrl,
  {
    entityId: number;
    updateEntityId: string;
    properties: Entity["properties"];
  }[]
>;

const stringifyArray = (array: unknown[]): string =>
  array.map((item) => JSON.stringify(item)).join(", ");

/**
 * Validates that the provided object is a valid ProposedEntitiesByType object.
 * @throws Error if the provided object does not match ProposedEntitiesByType
 */
export const validateProposedEntitiesByType = <
  EntityUpdate extends boolean = false,
>(
  parsedJson: JsonObject,
  update: EntityUpdate,
): parsedJson is EntityUpdate extends true
  ? ProposedEntityUpdatesByType
  : ProposedEntityCreationsByType => {
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
      `Invalid entities arrays in AI-provided response: ${stringifyArray(
        invalidArrays,
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

      if (!("entityId" in maybeEntity)) {
        return true;
      }

      if (
        ("sourceEntityId" in maybeEntity &&
          !("targetEntityId" in maybeEntity)) ||
        (!("sourceEntityId" in maybeEntity) && "targetEntityId" in maybeEntity)
      ) {
        return true;
      }

      if (update && !("updateEntityId" in maybeEntity)) {
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

export const generateTools = (
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
      name: "create_entities" satisfies FunctionName,
      description: "Create entities inferred from the provided text",
      parameters: {
        type: "object",
        properties: entityTypes.reduce<Record<VersionedUrl, JSONSchema>>(
          (acc, { schema, isLink }) => {
            acc[schema.$id] = {
              type: "array",
              title: `${schema.title} entities to create`,
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
                  properties: {
                    description: "The properties to set on the entity",
                    default: {},
                    type: "object",
                    properties: schema.properties,
                  },
                } satisfies ProposedEntitySchemaOrData,
                required: [
                  "entityId",
                  "properties",
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
  {
    type: "function",
    function: {
      name: "update_entities" satisfies FunctionName,
      description: dedent(`
            Update entities inferred from the provided text where you have been advised the entity already exists, 
            using the entityId provided. If you have additional information about properties that already exist,
            you should provide an updated property value that appropriately merges the existing and new information,
            e.g. by updating an entity's 'description' property to incorporate new information.
        `),
      parameters: {
        type: "object",
        properties: entityTypes.reduce<Record<VersionedUrl, JSONSchema>>(
          (acc, { schema }) => {
            acc[schema.$id] = {
              type: "array",
              title: `${schema.title} entities to update`,
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
                  updateEntityId: {
                    description:
                      "The existing string identifier for the entity, provided to you by the user.",
                    type: "string",
                  },
                  properties: {
                    description: "The properties to update on the entity",
                    default: {},
                    type: "object",
                    properties: schema.properties,
                  },
                } satisfies ProposedEntitySchemaOrData,
                required: ["entityId", "properties"],
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
