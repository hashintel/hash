import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId, EntityUuid } from "@local/hash-graph-types/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import type { Claim as ClaimEntity } from "@local/hash-isomorphic-utils/system-types/claim";
import { entityIdFromComponents } from "@local/hash-subgraph";
import dedent from "dedent";

import { getAiAssistantAccountIdActivity } from "../../../get-ai-assistant-account-id-activity.js";
import { logger } from "../../../shared/activity-logger.js";
import type { DereferencedEntityType } from "../../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import type {
  LlmMessage,
  LlmMessageToolResultContent,
  LlmUserMessage,
} from "../../../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import { stringify } from "../../../shared/stringify.js";
import type { LocalEntitySummary } from "./get-entity-summaries-from-text.js";
import type { Claim } from "./types.js";

const toolNames = ["submitClaims"] as const;

type ToolName = (typeof toolNames)[number];

const generateToolDefinitions = (params: {
  subjectEntities: LocalEntitySummary[];
}): Record<ToolName, LlmToolDefinition<ToolName>> => ({
  submitClaims: {
    name: "submitClaims",
    description: dedent(`
      Submit an exhaustive list of claims based on the information provided in the text, ensuring no information about the entity is missed.
    `),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              subjectEntityLocalId: {
                type: "string",
                description:
                  "The localID of the subject entity of the claim. Must be defined. If you don't have a relevant subject entity, don't include the claim.",
              },
              text: {
                type: "string",
                description: dedent(`
                  The text containing the claim, which:
                  - must follow a consistent sentence structure, with a single subject, a single predicate and a single object
                  - must have the one of the subject entities as the singular subject of the claim, for example a claim for an entity with name ${params.subjectEntities[0]?.name} must start with "${params.subjectEntities[0]?.name} <predicate> <object>"
                  - must specify the objectEntityId of the object of the claim, if the object of the claim is one of the potential object entities
                  - must be concise statements that are true based on the information provided in the text
                  - must be standalone, and not depend on any contextual information to make sense
                  - must not contain any pronouns, and refer to all entities by the name provided by the user (which may differ slightly from that in the text)
                  - must not be lists or contain multiple pieces of information – each piece of information must be expressed as a standalone claim
                  - must not include prepositional phrases, these must be provided separately in the "prepositionalPhrases" argument
                  - must include full and complete units when specifying numeric data as the object of the claim
                `),
              },
              prepositionalPhrases: {
                type: "array",
                items: {
                  type: "string",
                  description: dedent(`
                    A list of prepositional phrases that provide additional context to the predicate in the claim. Predicate phrases:
                    - must not refer to other entities
                    - must not provide additional information about the subject or object themselves, only focus on the predicate
                    
                    Examples of prepositional phrases for the example claim "Company X acquired Company Y":
                    - "on January 1, 2022"
                    - "for $8.5 billion"
                    - "with a combination of cash and stock"
                  `),
                },
              },
              objectEntityLocalId: {
                oneOf: [{ type: "string" }, { type: "null" }],
                description: dedent(`
                  The local ID of the entity that the claim is related to.
                  If the claim does not have another entity as its object, you must provide "null".
                `),
              },
            },
            required: [
              "text",
              "subjectEntityLocalId",
              "objectEntityLocalId",
              "prepositionalPhrases",
            ],
          },
        },
      },
      required: ["claims"],
    },
  },
});

const systemPrompt = dedent(`
  You are a claim extracting agent.

  The user will provide you with:
    - Text: the text from which you should extract claims.
    - URL: the URL the text was taken from, if any.
    - Title: The title of the text, if any.
    - Subject Entities: the subject entities of claims that the user is looking for, each of which are of the same type (i.e. have the same properties and outgoing links). 
    - Relevant Properties: a list of properties the user is looking for in the text. Pay particular attention to these properties when extracting claims.
    - Relevant Outgoing Links: a definition of the possible outgoing links the user is looking for in the text. Pay particular attention to relationships (links) with other entities of these kinds.
    - Potential Object Entities: a list of other entities mentioned in the text, which may be the object of claims. Include their id as the object of the claim if they are the object of the claim.

  You must provide an exhaustive list of claims about the provided subject entities based on the information provided in the text.
  For example, if you are provided with data from a table where the entity is a row of the table,
    all the information in each cell of the row should be represented in the claims.

  These claims will be later used to construct the entities with the properties and links which the user will specify.
  If any information in the text is relevant for constructing the relevant properties or outgoing links, you must include them as claims.
  
  Each claim should be in the format <subject> <predicate> <object>, where the subject is the singular subject of the claim.
  Example:
  [{ text: "Company X acquired Company Y.", prepositionalPhrases: ["in 2019", "for $10 million"], subjectEntityLocalId: "companyXabc", objectEntityLocalId: "companyYdef" }]
  Don't include claims which start with a subject you can't provide an id for. 
  Omit any claims that don't start with one of the subject entities provided.
  
  IMPORTANT: pay attention to the name of each SubjectEntity – each claim MUST start with one of these names, exactly as it is expressed in the <SubjectEntity>
             If this is slightly different to how the entity is named in the text, use the name of the SubjectEntity!
`);

const constructUserMessage = (params: {
  text: string;
  url: string | null;
  title: string | null;
  subjectEntities: LocalEntitySummary[];
  dereferencedEntityType: DereferencedEntityType;
  linkEntityTypesById: Record<string, DereferencedEntityType>;
  potentialObjectEntities: LocalEntitySummary[];
}): LlmUserMessage => {
  const {
    text,
    url,
    title,
    subjectEntities,
    dereferencedEntityType,
    linkEntityTypesById,
    potentialObjectEntities,
  } = params;

  const relevantProperties = Object.values(dereferencedEntityType.properties)
    .flatMap((value) => ("items" in value ? value.items : value))
    .map((definition) => ({
      title: definition.title,
      description: definition.description,
    }));

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
          ${url ? `<URL>${url}</URL>` : ""}
          ${title ? `<Title>${title}</Title>` : ""}
          <Text>${text}</Text>
          <RelevantProperties>
          These are the properties of entities that the user is particularly interested in. Prioritise claims relevant to these properties.
          ${relevantProperties
            .map(({ title: propertyTitle, description }) =>
              dedent(`<Property>
title: ${propertyTitle}
description: ${description}</Property>`),
            )
            .join("\n")}
          </RelevantProperties>
          <RelevantOutgoingLinks>
          These are the kinds of relationships with other entities that the subject entities may have.
          Pay attention to any claims which imply these sorts of relationships, and make sure to include them.
          Include the properties of the link as prepositional phrases in the claim
          Where the link is to another entity listed in subject or object entities, include its id as the objectEntityId.
          
          Example:
          text: "Company X acquired Company Y."
          prepositionalPhrases: ["in 2019", "for $3 billion"]
          subjectEntityId: companyXlocalEntityId
          objectEntityId: companyYlocalEntityId
          
          ${Object.keys(dereferencedEntityType.links ?? {})
            .map((linkEntityTypeId) => {
              const linkEntityType = linkEntityTypesById[linkEntityTypeId];

              if (!linkEntityType) {
                return "";
              }
              return dedent(`<Link>
            title: {linkEntityType.title}
            description: ${linkEntityType.description}
            properties: ${Object.values(linkEntityType.properties)
              .flatMap((value) => ("items" in value ? value.items : value))
              .map(({ title: propertyTitle, description }) =>
                dedent(`
              <Property>
              title: ${propertyTitle}
              description: ${description}
              </Property>`),
              )
              .join("\n")}
            </Link>`);
            })
            .join("\n")}
          </RelevantOutgoingLinks>
          <PotentialObjectEntities>
          These are other entities mentioned in the text which may be the object of claims.
          If they are the object of the claim, include their id as the objectEntityId.
          ${potentialObjectEntities
            .map(({ localId, name, summary }) =>
              dedent(`<PotentialObjectEntity>
          entityLocalId: ${localId}
          name: ${name}
          summary: ${summary}</PotentialObjectEntity>`),
            )
            .join("\n")}
          </PotentialObjectEntities>
          <SubjectEntities>
          These are the entities which claims can be about. For example, a claim might start '${
            subjectEntities[0]?.name
          } acquired...'.
          ${subjectEntities
            .map(({ localId, name, summary }) =>
              dedent(`<SubjectEntity>
entityLocalId: ${localId}
name: ${name}
summary: ${summary}</SubjectEntity>`),
            )
            .join("\n")}
          </SubjectEntities>

          Please now submit claims, remembering these key points:
            - Each claim MUST start with and be about one of the subject entities: ${subjectEntities
              .map(({ name }) => name)
              .join(", ")}
            - We are particularly interested in claims related to the following properties: ${relevantProperties
              .map((property) => property.title)
              .join(
                ", ",
              )}. You must include claims about these properties if they are present in the text.
`),
      },
    ],
  };
};

const retryMax = 3;

export const inferEntityClaimsFromTextAgent = async (params: {
  subjectEntities: LocalEntitySummary[];
  potentialObjectEntities: LocalEntitySummary[];
  text: string;
  url: string | null;
  title: string | null;
  contentType: "webpage" | "document";
  dereferencedEntityType: DereferencedEntityType;
  linkEntityTypesById: Record<string, DereferencedEntityType>;
  retryContext?: {
    previousInvalidClaims: Claim[];
    previousValidClaims: Claim[];
    retryMessages: LlmMessage[];
    retryCount: number;
  };
}): Promise<{ claims: Claim[] }> => {
  const {
    subjectEntities,
    potentialObjectEntities,
    text,
    url,
    title,
    contentType,
    dereferencedEntityType,
    linkEntityTypesById,
    retryContext,
  } = params;

  logger.debug(
    `Inferring claims from text for entities ${subjectEntities
      .map(({ name }) => name)
      .join(", ")}`,
  );

  const {
    createEntitiesAsDraft,
    userAuthentication,
    flowEntityId,
    stepId,
    webId,
  } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      model: "claude-3-haiku-20240307",
      tools: Object.values(generateToolDefinitions({ subjectEntities })),
      toolChoice: toolNames[0],
      systemPrompt,
      messages: [
        constructUserMessage({
          text,
          url,
          title,
          subjectEntities,
          dereferencedEntityType,
          linkEntityTypesById,
          potentialObjectEntities,
        }),
        ...(retryContext?.retryMessages ?? []),
      ],
    },
    {
      customMetadata: {
        stepId,
        taskName: "claims-from-text",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  const retry = (retryParams: {
    allValidInferredClaims: Claim[];
    allInvalidClaims: Claim[];
    retryMessages: LlmMessage[];
  }) => {
    const { allValidInferredClaims, allInvalidClaims, retryMessages } =
      retryParams;

    const { retryCount = 0 } = retryContext ?? {};

    if (retryCount >= retryMax) {
      logger.debug(
        "Exceeded the retry limit for inferring claims from text, returning the previously inferred claims.",
      );
      /**
       * If some of the claims are repeatedly invalid, we handle this gracefully
       * by returning all the valid claims which were parsed.
       */
      return {
        claims: allValidInferredClaims,
      };
    }

    return inferEntityClaimsFromTextAgent({
      ...params,
      retryContext: {
        previousInvalidClaims: allInvalidClaims,
        previousValidClaims: allValidInferredClaims,
        retryMessages,
        retryCount: retryCount + 1,
      },
    });
  };

  if (llmResponse.status === "max-tokens") {
    /**
     * @todo: ideally instead of retrying and asking for fewer claims, we would either:
     *  - provide information on which claims are relevant, so that these aren't omitted
     *  - gather claims on smaller chunks of text, so that obtaining all the claims for an
     *    entity doesn't exceed the maximum output token limit
     */
    return retry({
      allInvalidClaims: params.retryContext?.previousInvalidClaims ?? [],
      allValidInferredClaims: params.retryContext?.previousValidClaims ?? [],
      retryMessages: [
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "The response exceeded the maximum token limit.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                You attempted to submit too many claims.
                Try again by submitting fewer claims (fewer than 40).
              `),
            },
          ],
        },
      ],
    });
  } else if (llmResponse.status !== "ok") {
    return { claims: params.retryContext?.previousValidClaims ?? [] };
  }

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: llmResponse.message,
  });

  const validClaims: Claim[] = [];

  const potentiallyRepeatedInvalidClaims: (Claim & {
    invalidReason: string;
    toolCallId: string;
  })[] = [];

  const aiAssistantAccountId = await getAiAssistantAccountIdActivity({
    authentication: userAuthentication,
    grantCreatePermissionForWeb: webId,
    graphApiClient,
  });

  if (!aiAssistantAccountId) {
    throw new Error(`Failed to get the AI Assistant account for web ${webId}`);
  }

  for (const toolCall of toolCalls) {
    const input = toolCall.input as {
      claims: {
        subjectEntityLocalId: EntityId;
        text: string;
        prepositionalPhrases: string[];
        objectEntityLocalId: EntityId | null;
      }[];
    };

    for (const unfinishedClaims of input.claims) {
      const claimUuid = generateUuid() as EntityUuid;

      const claim: Omit<Claim, "sources"> = {
        ...unfinishedClaims,
        objectEntityLocalId: unfinishedClaims.objectEntityLocalId ?? undefined,
        claimId: entityIdFromComponents(webId, claimUuid),
      };

      const subjectEntity =
        subjectEntities.find(
          ({ localId }) => localId === claim.subjectEntityLocalId,
        ) ??
        potentialObjectEntities.find(
          ({ localId }) => localId === claim.subjectEntityLocalId,
        );

      if (!subjectEntity) {
        potentiallyRepeatedInvalidClaims.push({
          ...claim,
          invalidReason: `An invalid "subjectEntityLocalId" has been provided: ${claim.subjectEntityLocalId}. All claims must relate to a subject entity – don't submit claims that can't be linked to one. Review the subject entities in the earlier message and only provides claims that begin with one of them.`,
          toolCallId: toolCall.id,
        });

        continue;
      }

      const objectEntity =
        potentialObjectEntities.find(
          ({ localId }) => localId === claim.objectEntityLocalId,
        ) ??
        subjectEntities.find(
          ({ localId }) => localId === claim.objectEntityLocalId,
        );

      if (claim.objectEntityLocalId && !objectEntity) {
        potentiallyRepeatedInvalidClaims.push({
          ...claim,
          invalidReason: `An invalid "objectEntityLocalId" has been provided: ${claim.objectEntityLocalId} – if not null, the objectEntityId must relate to a provided entity. Review the object entities provided and match the objectEntityId to one of them – or if there is no match, provide 'null' for the objectEntityId`,
          toolCallId: toolCall.id,
        });

        continue;
      }

      if (
        !claim.text.toLowerCase().includes(subjectEntity.name.toLowerCase())
      ) {
        potentiallyRepeatedInvalidClaims.push({
          ...claim,
          invalidReason: `The claim specifies subjectEntityId "${claim.subjectEntityLocalId}", but that entity's name "${subjectEntity.name}" does not appear in the claim. Claims must start with the name of the subject. If you described the entity slightly different, resubmit the claim beginning with "${subjectEntity.name}" instead, as long as you are sure the claim relates to this same entity. If you don't have an appropriate subject for the claim, don't include the claim. Review the subject entities in my previous message for valid subjects.`,
          toolCallId: toolCall.id,
        });
      } else if (
        objectEntity &&
        !claim.text.toLowerCase().includes(objectEntity.name.toLowerCase())
      ) {
        potentiallyRepeatedInvalidClaims.push({
          ...claim,
          invalidReason: `The claim specifies objectEntityId "${claim.objectEntityLocalId}, but that entity's name "${objectEntity.name}" does not appear in the claim. Claims must end with the name of the object of the claim. If you described the entity slightly different, resubmit the claim ending with "${objectEntity.name}" instead. If you don't have an objectEntityId for the object of the claim, pass 'null' for objectEntityId.`,
          toolCallId: toolCall.id,
        });
      } else {
        validClaims.push(claim);

        const sources = [
          {
            type: contentType,
            location: {
              name: title ?? undefined,
              uri: url ?? undefined,
            },
          },
        ];

        const provenance: EnforcedEntityEditionProvenance = {
          actorType: "ai",
          origin: {
            id: flowEntityId,
            stepIds: [stepId],
            type: "flow",
          },
          sources,
        };

        /**
         * @todo H-3162: when we pass existing entities to Flows, we can link them directly to the claim here
         */
        await Entity.create<ClaimEntity>(
          graphApiClient,
          { actorId: aiAssistantAccountId },
          {
            draft: createEntitiesAsDraft,
            entityUuid: claimUuid,
            entityTypeId: "https://hash.ai/@hash/types/entity-type/claim/v/1",
            ownedById: webId,
            provenance: {
              actorType: "ai",
              origin: {
                id: flowEntityId,
                stepIds: [stepId],
                type: "flow",
              },
              sources,
            },
            relationships: createDefaultAuthorizationRelationships({
              actorId: userAuthentication.actorId,
            }),
            properties: {
              value: {
                "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
                  {
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                      provenance: {
                        sources: provenance.sources,
                      },
                    },
                    value: `${claim.text}${
                      claim.prepositionalPhrases.length
                        ? `– ${claim.prepositionalPhrases.join(", ")}`
                        : ""
                    }`,
                  },
                "https://hash.ai/@hash/types/property-type/subject/": {
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    provenance: {
                      sources: provenance.sources,
                    },
                  },
                  value: subjectEntity.name,
                },
                ...(objectEntity
                  ? {
                      "https://hash.ai/@hash/types/property-type/object/": {
                        metadata: {
                          dataTypeId:
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                          provenance: {
                            sources: provenance.sources,
                          },
                        },
                        value: objectEntity.name,
                      },
                    }
                  : {}),
              },
            },
          },
        );
      }
    }
  }

  const allValidInferredClaims = [
    ...validClaims,
    ...(retryContext?.previousValidClaims ?? []).filter(
      /**
       * The LLM may submit the same valid claim across multiple retries attempting to correct invalid claims
       */
      (claim) =>
        !validClaims.some((validClaim) => validClaim.text === claim.text),
    ),
  ];

  /**
   * Only give the model one chance to correct an invalid claim – if it doesn't, discard the claim.
   */
  const invalidClaims = potentiallyRepeatedInvalidClaims.filter(
    (claim) =>
      !(params.retryContext?.previousInvalidClaims ?? []).find(
        (previousInvalidClaims) => previousInvalidClaims.text === claim.text,
      ),
  );

  /** @todo: check if there are subject entities for which no claims have been provided */

  if (invalidClaims.length > 0) {
    const toolCallResponses = toolCalls.map<LlmMessageToolResultContent>(
      (toolCall) => {
        const invalidClaimsProvidedInToolCall = invalidClaims.filter(
          ({ toolCallId }) => toolCallId === toolCall.id,
        );

        if (invalidClaims.length === 0) {
          return {
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: "There were no invalid claims provided by this tool call.",
          };
        }

        return {
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: dedent(`
            The following claims are invalid:
            ${invalidClaimsProvidedInToolCall
              .map(
                (invalidClaim) =>
                  dedent`<InvalidClaims>
            text: ${invalidClaim.text}
            subjectEntityId: ${invalidClaim.subjectEntityLocalId}
            objectEntityId: ${invalidClaim.objectEntityLocalId}
            prepositionalPhrases: ${stringify(
              invalidClaim.prepositionalPhrases,
            )}
            
            Invalid because: ${invalidClaim.invalidReason}
            Please correct this!
            </InvalidClaims>`,
              )
              .join("\n\n")}

            You must now make another "submitClaims" tool call, correcting each of the errors identified above.
          `),
          is_error: true,
        };
      },
    );

    logger.debug(
      `Retrying inferring claims from text with the following tool call responses: ${stringify(
        toolCallResponses,
      )}`,
    );

    return retry({
      allInvalidClaims: [
        ...invalidClaims,
        ...(retryContext?.previousInvalidClaims ?? []),
      ],
      allValidInferredClaims,
      retryMessages: [
        llmResponse.message,
        {
          role: "user",
          content: toolCallResponses,
        },
      ],
    });
  }

  return { claims: allValidInferredClaims };
};
