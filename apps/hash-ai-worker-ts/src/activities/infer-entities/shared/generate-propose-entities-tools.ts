import type { VersionedUrl } from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type {
  ProposedEntity,
  ProposedEntitySchemaOrData,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import dedent from "dedent";
import type { JSONSchema } from "openai/lib/jsonschema";

import type { DereferencedEntityType } from "../../shared/dereference-entity-type.js";
import type { LlmToolDefinition } from "../../shared/get-llm-response/types.js";
import { generateSimplifiedTypeId } from "./generate-simplified-type-id.js";
import type { PropertyValueWithSimplifiedProperties } from "./map-simplified-properties-to-properties.js";
import { stripIdsFromDereferencedProperties } from "./strip-ids-from-dereferenced-properties.js";

export type ProposeEntitiesToolName = "abandon_entities" | "create_entities";

type ProposedEntityWithSimplifiedProperties = DistributiveOmit<
  ProposedEntity,
  "properties"
> & {
  properties?: Record<string, PropertyValueWithSimplifiedProperties>;
};

export type ProposedEntityToolCreationsByType = Record<
  string,
  ProposedEntityWithSimplifiedProperties[]
>;

export const generateToolLinkFields = (params: {
  canLinkToExistingEntities?: boolean;
}) => ({
  sourceEntityId: {
    description: dedent(`
      The entityId of the source entity of the link.
      ${
        params.canLinkToExistingEntities
          ? "If the source is an existing entity, it must be a string. If it is a proposed entity, it must be a number."
          : ""
      }
    `),
    ...(params.canLinkToExistingEntities
      ? {
          oneOf: [
            {
              type: "number",
            },
            {
              type: "string",
            },
          ],
        }
      : { type: "number" }),
  },
  targetEntityId: {
    description: dedent(`
      The entityId of the target entity of the link.
      ${
        params.canLinkToExistingEntities
          ? "If the target is an existing entity, it must be a string. If it is a proposed entity, it must be a number."
          : ""
      }
    `),
    ...(params.canLinkToExistingEntities
      ? {
          oneOf: [
            {
              type: "number",
            },
            {
              type: "string",
            },
          ],
        }
      : { type: "number" }),
  },
});

/**
 * @todo: consider adding tool call for proposing updates to existing entities
 * if they are provided.
 */
export const generateProposeEntitiesTools = (params: {
  entityTypes: {
    schema: DereferencedEntityType<string>;
    isLink: boolean;
  }[];
  canLinkToExistingEntities: boolean;
}): {
  tools: LlmToolDefinition<ProposeEntitiesToolName>[];
  simplifiedEntityTypeIdMappings: Record<string, VersionedUrl>;
} => {
  const { entityTypes, canLinkToExistingEntities } = params;

  let simplifiedEntityTypeIdMappings: Record<string, VersionedUrl> = {};

  const tools: LlmToolDefinition<ProposeEntitiesToolName>[] = [
    {
      name: "create_entities",
      description: "Create entities inferred from the provided text",
      inputSchema: {
        type: "object",
        properties: entityTypes.reduce<Record<string, JSONSchema>>(
          (acc, { schema, isLink }) => {
            const entityTypeId = schema.$id;

            const {
              simplifiedTypeId: simplifiedEntityTypeId,
              updatedTypeMappings,
            } = generateSimplifiedTypeId({
              title: schema.title,
              typeIdOrBaseUrl: entityTypeId,
              existingTypeMappings: simplifiedEntityTypeIdMappings,
            });

            simplifiedEntityTypeIdMappings = updatedTypeMappings;

            acc[simplifiedEntityTypeId] = {
              type: "array",
              title: `${schema.title} entities to create`,
              items: {
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
                    ? generateToolLinkFields({ canLinkToExistingEntities })
                    : {}),
                  properties: {
                    description: "The properties to set on the entity",
                    default: {},
                    type: "object",
                    properties: stripIdsFromDereferencedProperties({
                      properties: schema.properties,
                    }),
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

  return { tools, simplifiedEntityTypeIdMappings };
};
