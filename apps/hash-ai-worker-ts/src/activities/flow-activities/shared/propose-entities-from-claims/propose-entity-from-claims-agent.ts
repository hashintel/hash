import type { VersionedUrl } from "@blockprotocol/type-system";
import type { OriginProvenance } from "@local/hash-graph-client";
import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import {
  Entity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { entityIdFromComponents } from "@local/hash-subgraph";
import dedent from "dedent";
import type { JSONSchemaDefinition } from "openai/lib/jsonschema";

import { extractErrorMessage } from "../../../infer-entities/shared/extract-validation-failure-details.js";
import type { PropertyValueWithSimplifiedProperties } from "../../../infer-entities/shared/map-simplified-properties-to-properties.js";
import { mapSimplifiedPropertiesToProperties } from "../../../infer-entities/shared/map-simplified-properties-to-properties.js";
import { stripIdsFromDereferencedProperties } from "../../../infer-entities/shared/strip-ids-from-dereferenced-properties.js";
import type { DereferencedEntityType } from "../../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import type {
  LlmMessage,
  LlmUserMessage,
} from "../../../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import { stringify } from "../../../shared/stringify.js";
import type { ExistingEntitySummary } from "../../research-entities-action/summarize-existing-entities.js";
import type { LocalEntitySummary } from "../infer-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../infer-claims-from-text/types.js";

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
          additionalProperties: false,
          properties: {
            /**
             * @todo: attach provenance information to nested properties which have corresponding
             * property type definitions.
             *
             * @see https://linear.app/hash/issue/H-2755/attach-provenance-information-to-nested-properties-when-proposing
             */
            propertyValue: jsonSchema,
            claimIdsUsedToDetermineValue: {
              type: "array",
              items: {
                type: "string",
              },
              description: dedent(`
                The claim IDs of the claims used to determine the value of the property.
              `),
            },
          },
          required: ["propertyValue", "claimIdsUsedToDetermineValue"],
        } satisfies JSONSchemaDefinition,
      };
    },
    {},
  );
};

type InputPropertiesObject = {
  [key: string]: {
    propertyValue: unknown;
    claimIdsUsedToDetermineValue: string[];
  };
};

const mapInputPropertiesToPropertiesObject = (params: {
  inputProperties: InputPropertiesObject;
}): Record<string, PropertyValueWithSimplifiedProperties> => {
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
  allClaims: Claim[];
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
}): { propertyMetadata: ProposedEntity["propertyMetadata"] } => {
  const { inputProperties, allClaims, simplifiedPropertyTypeMappings } = params;

  const propertyMetadata: NonNullable<ProposedEntity["propertyMetadata"]> = {
    value: {},
  };

  for (const [
    simplifiedPropertyKey,
    { claimIdsUsedToDetermineValue },
  ] of Object.entries(inputProperties)) {
    const claimsUsedToDetermineValue = allClaims.filter((claim) =>
      claimIdsUsedToDetermineValue.includes(claim.claimId),
    );

    const sourcesUsedToDetermineValue = claimsUsedToDetermineValue
      .flatMap(({ sources }) => sources ?? [])
      /**
       * Deduplicate sources by URI, as the same source may have been used
       * to produce multiple claims.
       */
      .filter((source, index, all) => {
        const sourceLocationUri = source.location?.uri;
        if (sourceLocationUri) {
          return (
            all.findIndex(
              (otherSource) =>
                /** normalize by dropping any trailing slash */
                otherSource.location?.uri?.replace(/\/$/, "") ===
                sourceLocationUri.replace(/\/$/, ""),
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

    propertyMetadata.value[baseUrl] = {
      metadata: { provenance: { sources: sourcesUsedToDetermineValue } },
    };
  }

  return {
    propertyMetadata:
      Object.keys(propertyMetadata).length > 0
        ? propertyMetadata
        : { value: {} },
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
      description: "Propose an entity based on the provided claims.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        title: dereferencedEntityType.title,
        description: dereferencedEntityType.description,
        properties: {
          properties: {
            description: "The properties to set on the entity",
            default: {},
            type: "object",
            additionalProperties: false,
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
                        additionalProperties: false,
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
                            additionalProperties: false,
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
        "If it is not possible to satisfy the entity's schema based on the provided claims, abandon the entity.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: {
            description:
              "The reason why the entity cannot be proposed based on the provided claims.",
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

  I will provide you with:
    - Claims: a list of claims about the entity
    ${
      params.proposingOutgoingLinks
        ? `Possible outgoing link target entities: a list of entities which can be used as target entities when defining outgoing links on the entity`
        : ``
    }

  Please fill out as many properties as possible – do not optimize for short responses.

  The provided claims are your only source of information, so make sure to extract as much information as possible,
    and do not rely on other information about the entities in question you may know.

  You must make exactly one tool call. Provide all the properties of the single entity in that single tool call.
`);

const retryMax = 3;

export const proposeEntityFromClaimsAgent = async (params: {
  entitySummary: LocalEntitySummary;
  claims: {
    isObjectOf: Claim[];
    isSubjectOf: Claim[];
  };
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
    claims,
    dereferencedEntityType,
    simplifiedPropertyTypeMappings,
    retryContext,
    proposeOutgoingLinkEntityTypes,
    possibleOutgoingLinkTargetEntitySummaries,
  } = params;

  const allClaims = [...claims.isObjectOf, ...claims.isSubjectOf];

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const proposingOutgoingLinks =
    proposeOutgoingLinkEntityTypes.length > 0 &&
    possibleOutgoingLinkTargetEntitySummaries.length > 0;

  const llmResponse = await getLlmResponse(
    {
      model: "gpt-4o-2024-08-06",
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
                Entity name: ${entitySummary.name}
                Entity summary ${entitySummary.summary}
                Claims about entity: ${JSON.stringify(claims)}
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
        ...(retryContext?.retryMessages ?? []),
      ],
    },
    {
      customMetadata: {
        stepId,
        taskName: "entity-from-claims",
      },
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

    return proposeEntityFromClaimsAgent({
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

  if (toolCalls.length !== 1) {
    return retry({
      retryMessage: {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please try again – you must make exactly one tool call. Include all the properties of the proposed entity in a single call.",
          },
        ],
      },
    });
  }

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

    /**
     * @todo: consider validating claim IDs specified in the input properties
     */

    const { propertyMetadata } = generatePropertyMetadata({
      inputProperties,
      allClaims,
      simplifiedPropertyTypeMappings,
    });

    try {
      await Entity.validate(graphApiClient, userAuthentication, {
        entityTypes: [dereferencedEntityType.$id],
        components: {
          linkData: false,
          numItems: false,
          /** @todo: set this depending on whether entities are created as drafts? */
          requiredProperties: false,
        },
        properties: mergePropertyObjectAndMetadata(
          properties,
          propertyMetadata,
        ),
      });
    } catch (error) {
      const invalidReason = `${extractErrorMessage(error)}.`;

      retryToolCallMessages.push(
        `The properties of the proposed entity are invalid. Invalid reason: ${invalidReason}`,
      );
    }

    const proposedOutgoingLinkEntities: ProposedEntity[] = [];

    const editionProvenance: EnforcedEntityEditionProvenance = {
      actorType: "ai",
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

          const { propertyMetadata: outgoingLinkPropertyMetadata } =
            generatePropertyMetadata({
              inputProperties: outgoingLinkInputProperties,
              allClaims,
              simplifiedPropertyTypeMappings:
                outgoingLinkSimplifiedPropertyTypeMappings,
            });

          const claimsUsedToToCreateLink = allClaims.filter((claim) =>
            Object.values(outgoingLink.properties)
              .flatMap((property) => property.claimIdsUsedToDetermineValue)
              .includes(claim.claimId),
          );

          try {
            await Entity.validate(graphApiClient, userAuthentication, {
              entityTypes: [outgoingLink.entityTypeId],
              components: {
                linkData: false,
                numItems: false,
                /** @todo: set this depending on whether entities are created as drafts? */
                requiredProperties: false,
              },
              properties: mergePropertyObjectAndMetadata(
                outgoingLinkProperties,
                outgoingLinkPropertyMetadata,
              ),
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

          proposedOutgoingLinkEntities.push({
            claims: {
              /**
               * The claims used to create the link won't express the relationship itself as their subject or object,
               * but rather have the entity on either side of the link as the explicit subject / object.
               * The relationship this link entity represents is likely to more of a predicate in the claim, e.g. "Bob _worked at_ Acme Corp.".
               * For now, we set the relationship as the object of the claim – we could instead
               * 1. ask an LLM to determine if it's more properly the subject or object
               * 2. Or/additionally introduce a 'has predicate' relationship from the claim,
               *    which we either use always or ask an LLM to decide between subject/object/predicate based on the phrasing of the claim.
               */
              isObjectOf: claimsUsedToToCreateLink.map(
                (claim) => claim.claimId,
              ),
              isSubjectOf: [],
            },
            localEntityId: entityIdFromComponents(
              webId,
              generateUuid() as EntityUuid,
            ),
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

    const proposedEntity: ProposedEntity = {
      claims: {
        isObjectOf: claims.isObjectOf.map((claim) => claim.claimId),
        isSubjectOf: claims.isSubjectOf.map((claim) => claim.claimId),
      },
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
