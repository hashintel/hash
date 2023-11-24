import { VersionedUrl } from "@blockprotocol/type-system";
import OpenAI from "openai";
import { JSONSchema } from "openai/lib/jsonschema";

import { DereferencedEntityType } from "./dereference-entity-type";

export type FunctionName = "could_not_infer_entities" | "create_entities";

export const createFunctions = (
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
                    type: "number",
                  },
                  ...(isLink
                    ? {
                        sourceEntityId: {
                          type: "number",
                        },
                        targetEntityId: {
                          type: "number",
                        },
                      }
                    : {}),
                  properties: schema.properties,
                },
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
