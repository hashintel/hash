import type { JsonObject } from "@blockprotocol/core";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { ProposedEntitySchemaOrData } from "@local/hash-isomorphic-utils/ai-inference-types";
import dedent from "dedent";
import type { JSONSchema } from "openai/lib/jsonschema";

import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import type { LlmToolDefinition } from "../../shared/get-llm-response/types";
import type {
  ProposedEntityToolCreationsByType,
  ProposeEntitiesToolName,
} from "../shared/generate-propose-entities-tools";
import { generateProposeEntitiesTools } from "../shared/generate-propose-entities-tools";
import { generateSimplifiedTypeId } from "../shared/generate-simplified-type-id";
import type { EntityPropertyValueWithSimplifiedProperties } from "../shared/map-simplified-properties-to-properties";
import { stripIdsFromDereferencedProperties } from "../shared/strip-ids-from-dereferenced-properties";

export type PersistEntitiesToolName =
  | "update_entities"
  | ProposeEntitiesToolName;

export type ProposedEntityToolUpdatesByType = Record<
  string,
  {
    entityId: number;
    updateEntityId: string;
    properties: Record<string, EntityPropertyValueWithSimplifiedProperties>;
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
  ? ProposedEntityToolUpdatesByType
  : ProposedEntityToolCreationsByType => {
  /** @todo: replace this with logic that validates simplified entity type Ids */
  // const maybeVersionedUrls = Object.keys(parsedJson);

  // const invalidVersionedUrls = maybeVersionedUrls.filter(
  //   (maybeVersionedUrl) => {
  //     const result = validateVersionedUrl(maybeVersionedUrl);

  //     return result.type !== "Ok";
  //   },
  // );
  // if (invalidVersionedUrls.length > 0) {
  //   throw new Error(
  //     `Invalid versionedUrls in AI-provided response: ${invalidVersionedUrls.join(
  //       ", ",
  //     )}`,
  //   );
  // }

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
): {
  tools: LlmToolDefinition<PersistEntitiesToolName>[];
  simplifiedEntityTypeIdMappings: Record<string, VersionedUrl>;
} => {
  const {
    tools: proposeEntitiesTools,
    simplifiedEntityTypeIdMappings: existingSimplifiedTypeIdMappings,
  } = generateProposeEntitiesTools(entityTypes);

  let simplifiedEntityTypeIdMappings = existingSimplifiedTypeIdMappings;

  const tools = [
    ...proposeEntitiesTools,
    {
      name: "update_entities" as const,
      description: dedent(`
            Update entities inferred from the provided text where you have been advised the entity already exists, 
            using the entityId provided. If you have additional information about properties that already exist,
            you should provide an updated property value that appropriately merges the existing and new information,
            e.g. by updating an entity's 'description' property to incorporate new information.
        `),
      inputSchema: {
        type: "object",
        properties: entityTypes.reduce<Record<string, JSONSchema>>(
          (acc, { schema }) => {
            const entityTypeId = schema.$id;

            const existingSimplifiedEntityTypeId = Object.entries(
              simplifiedEntityTypeIdMappings,
            ).find(
              ([_, existingMappedEntityTypeId]) =>
                existingMappedEntityTypeId === entityTypeId,
            )?.[0];

            let simplifiedEntityTypeId = existingSimplifiedEntityTypeId;

            if (!simplifiedEntityTypeId) {
              const {
                simplifiedTypeId: newSimplifiedTypeId,
                updatedTypeMappings,
              } = generateSimplifiedTypeId({
                title: schema.title,
                typeIdOrBaseUrl: entityTypeId,
                existingTypeMappings: simplifiedEntityTypeIdMappings,
              });

              simplifiedEntityTypeId = newSimplifiedTypeId;

              simplifiedEntityTypeIdMappings = updatedTypeMappings;
            }

            acc[simplifiedEntityTypeId] = {
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
                    properties: stripIdsFromDereferencedProperties({
                      properties: schema.properties,
                    }),
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

  return { tools, simplifiedEntityTypeIdMappings };
};
