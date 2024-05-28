import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  OriginProvenance,
  ProvidedEntityEditionProvenance,
} from "@local/hash-graph-client";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import type { BaseUrl } from "@local/hash-subgraph";
import dedent from "dedent";
import type { JSONSchemaDefinition } from "openai/lib/jsonschema";

import { extractErrorMessage } from "../../../infer-entities/shared/extract-validation-failure-details";
import type { EntityPropertyValueWithSimplifiedProperties } from "../../../infer-entities/shared/map-simplified-properties-to-properties";
import { mapSimplifiedPropertiesToProperties } from "../../../infer-entities/shared/map-simplified-properties-to-properties";
import { stripIdsFromDereferencedProperties } from "../../../infer-entities/shared/strip-ids-from-dereferenced-properties";
import type { DereferencedEntityType } from "../../../shared/dereference-entity-type";
import { getFlowContext } from "../../../shared/get-flow-context";
import { getLlmResponse } from "../../../shared/get-llm-response";
import type {
  LlmMessage,
  LlmUserMessage,
} from "../../../shared/get-llm-response/llm-message";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message";
import type { LlmToolDefinition } from "../../../shared/get-llm-response/types";
import { graphApiClient } from "../../../shared/graph-api-client";
import { stringify } from "../../../shared/stringify";
import type { ExistingEntitySummary } from "../../research-entities-action/summarize-existing-entities";
import type { LocalEntitySummary } from "../infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../infer-facts-from-text/types";

const mapPropertiesSchemaToInputPropertiesSchema = (params: {
  properties: DereferencedEntityType["properties"];
}): {
  [key: string]: JSONSchemaDefinition;
} => {
  const { properties } = params;

  const propertiesWithoutIds = stripIdsFromDereferencedProperties({
    properties,
  });

  return Object.entries(propertiesWithoutIds).reduce(
    (prev, [simplifiedPropertyKey, jsonSchema]) => {
      return {
        ...prev,
        [simplifiedPropertyKey]: {
          type: "object",
          properties: {
            /**
             * @todo: attach provenance information to nested properties which have corresponding
             * property type definitions.
             *
             * @see https://linear.app/hash/issue/H-2755/attach-provenance-information-to-nested-properties-when-proposing
             */
            propertyValue: jsonSchema,
            factIdsUsedToDetermineValue: {
              type: "array",
              items: {
                type: "string",
              },
              description: dedent(`
                The fact IDs of the facts used to determine the value of the property.
              `),
            },
          },
          required: ["propertyValue", "factIdsUsedToDetermineValue"],
        } satisfies JSONSchemaDefinition,
      };
    },
    {},
  );
};

type InputPropertiesObject = {
  [key: string]: {
    propertyValue: unknown;
    factIdsUsedToDetermineValue: string[];
  };
};

const mapInputPropertiesToPropertiesObject = (params: {
  inputProperties: InputPropertiesObject;
}): Record<string, EntityPropertyValueWithSimplifiedProperties> => {
  const { inputProperties } = params;

  return Object.entries(inputProperties).reduce(
    (prev, [simplifiedPropertyKey, { propertyValue }]) => {
      return {
        ...prev,
        [simplifiedPropertyKey]: propertyValue,
      };
    },
    {},
  );
};

const generatePropertyMetadata = (params: {
  inputProperties: InputPropertiesObject;
  facts: Fact[];
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
}): { propertyMetadata: ProposedEntity["propertyMetadata"] } => {
  const { inputProperties, facts, simplifiedPropertyTypeMappings } = params;

  const propertyMetadata: NonNullable<ProposedEntity["propertyMetadata"]> = [];

  for (const [
    simplifiedPropertyKey,
    { factIdsUsedToDetermineValue },
  ] of Object.entries(inputProperties)) {
    const factsUsedToDetermineValue = facts.filter((fact) =>
      factIdsUsedToDetermineValue.includes(fact.factId),
    );

    const sourcesUsedToDetermineValue = factsUsedToDetermineValue
      .flatMap(({ sources }) => sources ?? [])
      /**
       * Deduplicate sources by URI, as the same source may have been used
       * to produce multiple facts.
       */
      .filter((source, index, all) => {
        const sourceLocationUri = source.location?.uri;
        if (sourceLocationUri) {
          return (
            all.findIndex(
              (otherSource) => otherSource.location?.uri === sourceLocationUri,
            ) === index
          );
        }
        return source;
      });

    const baseUrl = simplifiedPropertyTypeMappings[simplifiedPropertyKey];

    if (!baseUrl) {
      throw new Error(
        `Could not find base URL mapping for simplified property key: ${simplifiedPropertyKey}`,
      );
    }

    propertyMetadata.push({
      path: [baseUrl],
      metadata: { provenance: { sources: sourcesUsedToDetermineValue } },
    });
  }

  return {
    propertyMetadata:
      propertyMetadata.length > 0 ? propertyMetadata : undefined,
  };
};

const toolNames = ["proposeEntity", "abandonEntity"] as const;

type ToolName = (typeof toolNames)[number];

const generateToolDefinitions = (params: {
  dereferencedEntityType: DereferencedEntityType;
  proposeOutgoingLinkEntityTypes: {
    schema: DereferencedEntityType;
    simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  }[];
}): Record<ToolName, LlmToolDefinition> => {
  const { dereferencedEntityType, proposeOutgoingLinkEntityTypes } = params;

  return {
    proposeEntity: {
      name: "proposeEntity",
      description: "Propose an entity based on the provided facts.",
      inputSchema: {
        type: "object",
        title: dereferencedEntityType.title,
        description: dereferencedEntityType.description,
        properties: {
          properties: {
            description: "The properties to set on the entity",
            default: {},
            type: "object",
            properties: mapPropertiesSchemaToInputPropertiesSchema({
              properties: dereferencedEntityType.properties,
            }),
          },
          ...(proposeOutgoingLinkEntityTypes.length > 0
            ? {
                outgoingLinks: {
                  type: "array",
                  items: {
                    oneOf: proposeOutgoingLinkEntityTypes.map(
                      ({ schema: dereferencedOutgoingLinkEntityType }) => ({
                        type: "object",
                        properties: {
                          entityTypeId: {
                            type: "string",
                            enum: [dereferencedOutgoingLinkEntityType.$id],
                            description:
                              "The entity type ID of the target entity",
                          },
                          targetEntityId: {
                            type: "string",
                            description: "The ID of the target entity",
                          },
                          properties: {
                            description:
                              "The properties to set on the outgoing link",
                            default: {},
                            type: "object",
                            properties:
                              mapPropertiesSchemaToInputPropertiesSchema({
                                properties:
                                  dereferencedOutgoingLinkEntityType.properties,
                              }),
                          },
                        },
                        required: [
                          "entityTypeId",
                          "targetEntityId",
                          "properties",
                        ],
                      }),
                    ),
                  },
                },
              }
            : {}),
        },
        required: [
          "properties",
          ...(proposeOutgoingLinkEntityTypes.length > 0
            ? ["outgoingLinks"]
            : []),
        ],
      },
    },
    abandonEntity: {
      name: "abandonEntity",
      description:
        "If it is not possible to satisfy the entity's schema based on the provided facts, abandon the entity.",
      inputSchema: {
        type: "object",
        properties: {
          explanation: {
            description:
              "The reason why the entity cannot be proposed based on the provided facts.",
            type: "string",
          },
        },
        required: ["explanation"],
      },
    },
  };
};

const generateSystemPrompt = (params: { proposingOutgoingLinks: boolean }) =>
  dedent(`
  You are an entity proposal agent.

  The user will provide you with:
    - Facts: a list of facts about the entity
    ${params.proposingOutgoingLinks ? `Possible outgoing link target entities: a list of entities which can be used as target entities when defining outgoing links on the entity` : ``}
  
  The user has requested that you fill out as many properties as possible, so please do so. Do not optimize for short responses.

  The provided facts are your only source of information, so make sure to extract as much information as possible, 
    and do not rely on other information about the entities in question you may know.

  You must make exactly one tool call.
`);

const retryMax = 3;

export const proposeEntityFromFacts = async (params: {
  entitySummary: LocalEntitySummary;
  facts: Fact[];
  dereferencedEntityType: DereferencedEntityType;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  proposeOutgoingLinkEntityTypes: {
    schema: DereferencedEntityType;
    simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  }[];
  possibleOutgoingLinkTargetEntitySummaries: (
    | LocalEntitySummary
    | ExistingEntitySummary
  )[];
  retryContext?: {
    retryCount: number;
    retryMessages: LlmMessage[];
  };
}): Promise<
  | {
      status: "ok";
      proposedEntity: ProposedEntity;
      proposedOutgoingLinkEntities: ProposedEntity[];
    }
  | {
      status: "abandoned";
      reason: string;
    }
  | {
      status: "exceeded-maximum-retries";
    }
> => {
  const {
    entitySummary,
    facts,
    dereferencedEntityType,
    simplifiedPropertyTypeMappings,
    retryContext,
    proposeOutgoingLinkEntityTypes,
    possibleOutgoingLinkTargetEntitySummaries,
  } = params;

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const proposingOutgoingLinks =
    proposeOutgoingLinkEntityTypes.length > 0 &&
    possibleOutgoingLinkTargetEntitySummaries.length > 0;

  const llmResponse = await getLlmResponse(
    {
      model: "gpt-4o-2024-05-13",
      tools: Object.values(
        generateToolDefinitions({
          dereferencedEntityType,
          proposeOutgoingLinkEntityTypes,
        }),
      ),
      toolChoice: "required",
      systemPrompt: generateSystemPrompt({
        proposingOutgoingLinks,
      }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                Facts: ${JSON.stringify(facts)}
                ${
                  proposingOutgoingLinks
                    ? `Possible outgoing link target entities: ${JSON.stringify(
                        possibleOutgoingLinkTargetEntitySummaries,
                      )}`
                    : ""
                }
              
              `),
            },
          ],
        },
      ],
      ...(retryContext?.retryMessages ?? []),
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    throw new Error(
      `Failed to get response from LLM: ${stringify(llmResponse)}`,
    );
  }

  const retry = (retryParams: { retryMessage: LlmUserMessage }) => {
    const { retryCount = 0 } = retryContext ?? {};

    if (retryCount >= retryMax) {
      return {
        status: "exceeded-maximum-retries" as const,
      };
    }

    return proposeEntityFromFacts({
      ...params,
      retryContext: {
        retryCount: retryCount + 1,
        retryMessages: [llmResponse.message, retryParams.retryMessage],
      },
    });
  };

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: llmResponse.message,
  });

  /** @todo: handle unexpected number of tool calls */

  const proposeEntityToolCall = toolCalls.find(
    (toolCall) => toolCall.name === "proposeEntity",
  );

  if (proposeEntityToolCall) {
    const { properties: inputProperties, outgoingLinks } =
      proposeEntityToolCall.input as {
        properties: InputPropertiesObject;
        outgoingLinks?: {
          entityTypeId: string;
          targetEntityId: string;
          properties: InputPropertiesObject;
        }[];
      };

    const simplifiedProperties = mapInputPropertiesToPropertiesObject({
      inputProperties,
    });

    const properties = mapSimplifiedPropertiesToProperties({
      simplifiedProperties,
      simplifiedPropertyTypeMappings,
    });

    const retryToolCallMessages: string[] = [];

    try {
      await graphApiClient.validateEntity(userAuthentication.actorId, {
        entityTypes: [dereferencedEntityType.$id],
        components: {
          linkData: false,
          numItems: false,
          /** @todo: set this depending on whether entities are created as drafts? */
          requiredProperties: false,
        },
        properties,
      });
    } catch (error) {
      const invalidReason = `${extractErrorMessage(error)}.`;

      retryToolCallMessages.push(
        `The properties of the proposed entity are invalid. Invalid reason: ${invalidReason}`,
      );
    }

    const proposedOutgoingLinkEntities: ProposedEntity[] = [];

    const { stepId } = await getFlowContext();

    const editionProvenance: ProvidedEntityEditionProvenance = {
      actorType: "ai",
      // @ts-expect-error - `ProvidedEntityEditionProvenanceOrigin` is not being generated correctly from the Graph API
      origin: {
        type: "flow",
        id: flowEntityId,
        stepIds: [stepId],
      } satisfies OriginProvenance,
    };

    if (proposingOutgoingLinks && outgoingLinks) {
      await Promise.all(
        outgoingLinks.map(async (outgoingLink) => {
          const {
            schema: dereferencedOutgoingLinkEntityType,
            simplifiedPropertyTypeMappings:
              outgoingLinkSimplifiedPropertyTypeMappings,
          } =
            proposeOutgoingLinkEntityTypes.find(
              ({ schema }) => schema.$id === outgoingLink.entityTypeId,
            ) ?? {};

          if (!outgoingLinkSimplifiedPropertyTypeMappings) {
            throw new Error(
              `Could not find simplified property type mappings for entity type ID: ${outgoingLink.entityTypeId}`,
            );
          }

          if (!dereferencedOutgoingLinkEntityType) {
            throw new Error(
              `Could not find dereferenced entity type for entity type ID: ${outgoingLink.entityTypeId}`,
            );
          }

          const outgoingLinkInputProperties = outgoingLink.properties;

          const outgoingLinkSimplifiedProperties =
            mapInputPropertiesToPropertiesObject({
              inputProperties: outgoingLinkInputProperties,
            });

          const outgoingLinkProperties = mapSimplifiedPropertiesToProperties({
            simplifiedProperties: outgoingLinkSimplifiedProperties,
            simplifiedPropertyTypeMappings:
              outgoingLinkSimplifiedPropertyTypeMappings,
          });

          try {
            await graphApiClient.validateEntity(userAuthentication.actorId, {
              entityTypes: [outgoingLink.entityTypeId],
              components: {
                linkData: false,
                numItems: false,
                /** @todo: set this depending on whether entities are created as drafts? */
                requiredProperties: false,
              },
              properties: outgoingLinkProperties,
            });
          } catch (error) {
            const invalidReason = `${extractErrorMessage(error)}.`;

            retryToolCallMessages.push(
              `The properties of a proposed outgoing link are invalid. Invalid reason: ${invalidReason}`,
            );
          }

          const targetEntitySummary =
            possibleOutgoingLinkTargetEntitySummaries.find(
              (possibleOutgoingLinkTargetEntitySummary) =>
                "localId" in possibleOutgoingLinkTargetEntitySummary
                  ? possibleOutgoingLinkTargetEntitySummary.localId ===
                    outgoingLink.targetEntityId
                  : possibleOutgoingLinkTargetEntitySummary.entityId ===
                    outgoingLink.targetEntityId,
            );

          if (!targetEntitySummary) {
            retryToolCallMessages.push(
              `The target entity with local ID ${outgoingLink.targetEntityId} does not exist.`,
            );

            return;
          }

          const { propertyMetadata: outgoingLinkPropertyMetadata } =
            generatePropertyMetadata({
              inputProperties: outgoingLinkInputProperties,
              facts,
              simplifiedPropertyTypeMappings:
                outgoingLinkSimplifiedPropertyTypeMappings,
            });

          proposedOutgoingLinkEntities.push({
            localEntityId: generateUuid(),
            summary: `"${dereferencedOutgoingLinkEntityType.title}" link with source ${entitySummary.name} and target ${targetEntitySummary.name}`,
            sourceEntityId: {
              kind: "proposed-entity",
              localId: entitySummary.localId,
            },
            targetEntityId:
              "localId" in targetEntitySummary
                ? {
                    kind: "proposed-entity",
                    localId: targetEntitySummary.localId,
                  }
                : {
                    kind: "existing-entity",
                    entityId: targetEntitySummary.entityId,
                  },
            entityTypeId: outgoingLink.entityTypeId as VersionedUrl,
            propertyMetadata: outgoingLinkPropertyMetadata,
            properties: outgoingLinkProperties,
            provenance: editionProvenance,
          });
        }),
      );
    }

    if (retryToolCallMessages.length > 0) {
      return retry({
        retryMessage: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: proposeEntityToolCall.id,
              content: dedent(`
                ${retryToolCallMessages.join("\n")}
                
                Make another call to "proposeEntity" addressing the issue(s).
              `),
              is_error: true,
            },
          ],
        },
      });
    }

    /**
     * @todo: consider validating fact IDs specified in the input properties
     */

    const { propertyMetadata } = generatePropertyMetadata({
      inputProperties,
      facts,
      simplifiedPropertyTypeMappings,
    });

    const proposedEntity: ProposedEntity = {
      localEntityId: entitySummary.localId,
      propertyMetadata,
      summary: entitySummary.summary,
      entityTypeId: dereferencedEntityType.$id,
      properties,
      provenance: editionProvenance,
    };

    return {
      status: "ok",
      proposedEntity,
      proposedOutgoingLinkEntities,
    };
  }

  const abandonEntityToolCall = toolCalls.find(
    (toolCall) => toolCall.name === "abandonEntity",
  );

  if (abandonEntityToolCall) {
    const { explanation } = abandonEntityToolCall.input as {
      explanation: string;
    };

    return {
      status: "abandoned",
      reason: explanation,
    };
  }

  return retry({
    retryMessage: {
      role: "user",
      content: [
        {
          type: "text",
          text: "You didn't make any tool calls, you must make exactly one tool call.",
        },
      ],
    },
  });
};
