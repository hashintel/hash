import type { JsonObject } from "@blockprotocol/core";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { validateVersionedUrl } from "@blockprotocol/type-system";
import type { ProposedEntitySchemaOrData } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { Entity } from "@local/hash-subgraph";
import dedent from "dedent";
import type { JSONSchema } from "openai/lib/jsonschema";

import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import type { LlmToolDefinition } from "../../shared/get-llm-response/types";
import type {
  ProposedEntityCreationsByType,
  ProposeEntitiesToolName,
} from "../shared/generate-propose-entities-tools";
import { generateProposeEntitiesTools } from "../shared/generate-propose-entities-tools";

export type PersistEntitiesToolName =
  | "update_entities"
  | ProposeEntitiesToolName;

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
): LlmToolDefinition<PersistEntitiesToolName>[] => [
  ...generateProposeEntitiesTools(entityTypes),
  {
    name: "update_entities",
    description: dedent(`
            Update entities inferred from the provided text where you have been advised the entity already exists, 
            using the entityId provided. If you have additional information about properties that already exist,
            you should provide an updated property value that appropriately merges the existing and new information,
            e.g. by updating an entity's 'description' property to incorporate new information.
        `),
    inputSchema: {
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
];
