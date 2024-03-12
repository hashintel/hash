import type { JsonObject } from "@blockprotocol/core";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { validateVersionedUrl } from "@blockprotocol/type-system";
import type {
  ProposedEntity,
  ProposedEntitySchemaOrData,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type { Entity } from "@local/hash-subgraph";
import dedent from "dedent";
import type OpenAI from "openai";
import type { JSONSchema } from "openai/lib/jsonschema";

import type { DereferencedEntityType } from "../dereference-entity-type";

export type FunctionName =
  | "abandon_entities"
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

  const invalidEntities = maybeEntitiesArrays.flat().filter((maybeEntity) => {
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
      ("sourceEntityId" in maybeEntity && !("targetEntityId" in maybeEntity)) ||
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

export const generatePersistEntitiesTools = (
  entityTypes: {
    schema: DereferencedEntityType;
    isLink: boolean;
  }[],
): OpenAI.Chat.Completions.ChatCompletionTool[] => [
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
      name: "abandon_entities" satisfies FunctionName,
      description:
        "Give up trying to create or update entity, following failures which you cannot correct",
      parameters: {
        type: "object",
        properties: {
          entityIds: {
            type: "array",
            title: "The entityIds of the entities to abandon",
            items: {
              type: "number",
            },
          },
        },
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
