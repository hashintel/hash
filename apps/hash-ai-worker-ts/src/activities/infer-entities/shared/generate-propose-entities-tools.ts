import {
  validateVersionedUrl,
  type VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  ProposedEntity,
  ProposedEntitySchemaOrData,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { type EntityPropertiesObject, isBaseUrl } from "@local/hash-subgraph";
import type { JSONSchema } from "openai/lib/jsonschema";

import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import type { LlmToolDefinition } from "../../shared/get-llm-response/types";

export type ProposeEntitiesToolName = "abandon_entities" | "create_entities";

export type ProposedEntityCreationsByType = Record<
  VersionedUrl,
  ProposedEntity[]
>;

const sanitizePropertyKeys = (
  properties: EntityPropertiesObject,
): EntityPropertiesObject => {
  return Object.entries(properties).reduce((prev, [key, value]) => {
    let sanitizedKey = key;

    /**
     * Sometimes the model attaches a "?" to the base URL for no reason.
     * If it's there, remove it.
     */
    if (sanitizedKey.endsWith("?")) {
      sanitizedKey = sanitizedKey.slice(0, -1);
    }

    /**
     * Ensure that the key ends with a trailing slash if it's a base URL.
     */
    if (!sanitizedKey.endsWith("/") && isBaseUrl(`${sanitizedKey}/`)) {
      sanitizedKey = `${sanitizedKey}/`;
    }

    return {
      ...prev,
      [sanitizedKey]:
        typeof value === "object" && value !== null
          ? Array.isArray(value)
            ? value.map((arrayItem) =>
                typeof arrayItem === "object" &&
                arrayItem !== null &&
                !Array.isArray(arrayItem)
                  ? sanitizePropertyKeys(arrayItem)
                  : arrayItem,
              )
            : sanitizePropertyKeys(value)
          : value,
    };
  }, {} as EntityPropertiesObject);
};

export const generateProposeEntitiesTools = (
  entityTypes: {
    schema: DereferencedEntityType;
    isLink: boolean;
  }[],
): LlmToolDefinition<ProposeEntitiesToolName>[] => [
  {
    name: "create_entities",
    description: "Create entities inferred from the provided text",
    inputSchema: {
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
    sanitizeInputBeforeValidation: (unsanitizedInput: object) => {
      return Object.entries(unsanitizedInput).reduce(
        (prev, [entityTypeId, proposedEntitiesOfType]) => {
          /** */
          if (
            !Array.isArray(proposedEntitiesOfType) ||
            validateVersionedUrl(entityTypeId).type !== "Ok"
          ) {
            return {
              ...prev,
              [entityTypeId as VersionedUrl]:
                proposedEntitiesOfType as ProposedEntity[],
            };
          }

          return {
            ...prev,
            [entityTypeId]: proposedEntitiesOfType.map(
              (proposedEntity: ProposedEntity) => {
                const propertiesWithTrialingSlashes = proposedEntity.properties
                  ? sanitizePropertyKeys(proposedEntity.properties)
                  : proposedEntity.properties;

                return {
                  ...proposedEntity,
                  properties: propertiesWithTrialingSlashes,
                };
              },
            ),
          };
        },
        {} as ProposedEntityCreationsByType,
      );
    },
  },
  {
    name: "abandon_entities",
    description:
      "Give up trying to create, following failures which you cannot correct",
    inputSchema: {
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
];
