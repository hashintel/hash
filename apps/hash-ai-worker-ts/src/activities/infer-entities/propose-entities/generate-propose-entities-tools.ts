import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  ProposedEntity,
  ProposedEntitySchemaOrData,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type { Entity } from "@local/hash-subgraph";
import type OpenAI from "openai";
import type { JSONSchema } from "openai/lib/jsonschema";

import type { DereferencedEntityType } from "../../shared/dereference-entity-type";

export type FunctionName = "abandon_entities" | "create_entities";

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

export const generateProposeEntitiesTools = (
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
        "Give up trying to create, following failures which you cannot correct",
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
];
