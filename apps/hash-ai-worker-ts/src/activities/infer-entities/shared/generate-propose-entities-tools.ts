import type { VersionedUrl } from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type {
  DeprecatedProposedEntity,
  ProposedEntitySchemaOrData,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type { JSONSchema } from "openai/lib/jsonschema";

import type { DereferencedEntityType } from "../../shared/dereference-entity-type.js";
import type { LlmToolDefinition } from "../../shared/get-llm-response/types.js";
import { generateSimplifiedTypeId } from "./generate-simplified-type-id.js";
import type { PropertyValueWithSimplifiedProperties } from "./map-simplified-properties-to-properties.js";
import { stripIdsFromDereferencedProperties } from "./strip-ids-from-dereferenced-properties.js";

export type ProposeEntitiesToolName = "abandon_entities" | "create_entities";

type ProposedEntityWithSimplifiedProperties = DistributiveOmit<
  DeprecatedProposedEntity,
  "properties"
> & {
  properties?: Record<string, PropertyValueWithSimplifiedProperties>;
};

export type ProposedEntityToolCreationsByType = Record<
  string,
  ProposedEntityWithSimplifiedProperties[]
>;

export const generateToolLinkFields = () => ({
  sourceEntityId: {
    description: "The entityId of the source entity of the link.",
    type: "number",
  },
  targetEntityId: {
    description: "The entityId of the target entity of the link.",
    type: "number",
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
}): {
  tools: LlmToolDefinition<ProposeEntitiesToolName>[];
  simplifiedEntityTypeIdMappings: Record<string, VersionedUrl>;
} => {
  const { entityTypes } = params;

  let simplifiedEntityTypeIdMappings: Record<string, VersionedUrl> = {};
  const reverseSimplifiedEntityTypeIdMappings: Record<VersionedUrl, string> =
    {};
  const tools: LlmToolDefinition<ProposeEntitiesToolName>[] = [
    {
      name: "create_entities",
      description: "Create entities inferred from the provided text",
      inputSchema: {
        type: "object",
        additionalProperties: false,
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
              existingReverseTypeMappings:
                reverseSimplifiedEntityTypeIdMappings,
            });

            simplifiedEntityTypeIdMappings = updatedTypeMappings;

            /**
             * @todo H-2241 support proposing entities with multiple types, or remove this code (used by the browser plugin)
             *    in favour of propose-entities-from-claims
             */
            acc[simplifiedEntityTypeId] = {
              type: "array",
              title: `${schema.title} entities to create`,
              items: {
                type: "object",
                additionalProperties: false,
                title: schema.title,
                description: schema.description,
                properties: {
                  entityId: {
                    description:
                      "Your numerical identifier for the entity, unique among the inferred entities in this conversation",
                    type: "number",
                  },
                  ...(isLink ? generateToolLinkFields() : {}),
                  properties: {
                    description: "The properties to set on the entity",
                    default: {},
                    type: "object",
                    additionalProperties: false,
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
        additionalProperties: false,
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
