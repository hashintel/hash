import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import dedent from "dedent";

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
import type { Fact } from "./types.js";

const toolNames = ["submitFacts"] as const;

type ToolName = (typeof toolNames)[number];

const generateToolDefinitions = (params: {
  subjectEntities: LocalEntitySummary[];
}): Record<ToolName, LlmToolDefinition<ToolName>> => ({
  submitFacts: {
    name: "submitFacts",
    description: dedent(`
      Submit an exhaustive list of facts based on the information provided in the text, ensuring no information about the entity is missed.
    `),
    inputSchema: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subjectEntityLocalId: {
                type: "string",
                description:
                  "The local ID of the subject entity of the fact. Must be defined. If you don't have a relevant subject entity, don't include the fact.",
              },
              text: {
                type: "string",
                description: dedent(`
                  The text containing the fact, which:
                  - must follow a consistent sentence structure, with a single subject, a single predicate and a single object
                  - must have the one of the subject entities as the singular subject of the fact, for example a fact for an entity with name ${params.subjectEntities[0]?.name} must start with "${params.subjectEntities[0]?.name} <predicate> <object>"
                  - must specify the objectEntityId of the object of the fact, if the object of the fact is one of the potential object entities
                  - must be concise statements that are true based on the information provided in the text
                  - must be standalone, and not depend on any contextual information to make sense
                  - must not contain any pronouns, and refer to all entities by the name provided by the user (which may differ slightly from that in the text)
                  - must not be lists or contain multiple pieces of information – each piece of information must be expressed as a standalone fact
                  - must not include prepositional phrases, these must be provided separately in the "prepositionalPhrases" argument
                  - must include full and complete units when specifying numeric data as the object of the fact
                `),
              },
              prepositionalPhrases: {
                type: "array",
                items: {
                  type: "string",
                  description: dedent(`
                    A list of prepositional phrases that provide additional context to the predicate in the fact. Predicate phrases:
                    - must not refer to other entities
                    - must not provide additional information about the subject or object themselves, only focus on the predicate
                    
                    Examples of prepositional phrases for the example fact "Company X acquired Company Y":
                    - "on January 1, 2022"
                    - "for $8.5 billion"
                    - "with a combination of cash and stock"
                  `),
                },
              },
              objectEntityLocalId: {
                oneOf: [{ type: "string" }, { type: "null" }],
                description: dedent(`
                  The local ID of the entity that the fact is related to.
                  If the fact does not have another entity as its object, you must provide "null".
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
      required: ["facts"],
    },
  },
});

const systemPrompt = dedent(`
  You are a fact extracting agent.

  The user will provide you with:
    - Text: the text from which you should extract facts.
    - URL: the URL the text was taken from, if any.
    - Title: The title of the text, if any.
    - Subject Entities: the subject entities of facts that the user is looking for, each of which are of the same type (i.e. have the same properties and outgoing links). 
    - Relevant Properties: a list of properties the user is looking for in the text. Pay particular attention to these properties when extracting facts.
    - Relevant Outgoing Links: a definition of the possible outgoing links the user is looking for in the text. Pay particular attention to relationships (links) with other entities of these kinds.
    - Potential Object Entities: a list of other entities mentioned in the text, which may be the object of facts. Include their id as the object of the fact if they are the object of the fact.

  You must provide an exhaustive list of facts about the provided subject entities based on the information provided in the text.
  For example, if you are provided with data from a table where the entity is a row of the table,
    all the information in each cell of the row should be represented in the facts.

  These facts will be later used to construct the entities with the properties and links which the user will specify.
  If any information in the text is relevant for constructing the relevant properties or outgoing links, you must include them as facts.
  
  Each fact should be in the format <subject> <predicate> <object>, where the subject is the singular subject of the fact.
  Example:
  [{ text: "Company X acquired Company Y.", prepositionalPhrases: ["in 2019", "for $10 million"], subjectEntityLocalId: "companyXabc", objectEntityLocalId: "companyYdef" }]
  Don't include facts which start with a subject you can't provide an id for. 
  Omit any facts that don't start with one of the subject entities provided.
  
  IMPORTANT: pay attention to the name of each SubjectEntity – each fact MUST start with one of these names, exactly as it is expressed in the <SubjectEntity>
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
          These are the properties of entities that the user is particularly interested in. Prioritise facts relevant to these properties.
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
          Pay attention to any facts which imply these sorts of relationships, and make sure to include them.
          Include the properties of the link as prepositional phrases in the fact
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
          These are other entities mentioned in the text which may be the object of facts.
          If they are the object of the fact, include their id as the objectEntityId.
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
          These are the entities which facts can be about. For example, a fact might start '${subjectEntities[0]?.name} acquired...'.
          ${subjectEntities
            .map(({ localId, name, summary }) =>
              dedent(`<SubjectEntity>
entityLocalId: ${localId}
name: ${name}
summary: ${summary}</SubjectEntity>`),
            )
            .join("\n")}
          </SubjectEntities>

          Please now submit facts, remembering these key points:
            - Each fact MUST start with and be about one of the subject entities: ${subjectEntities.map(({ name }) => name).join(", ")}
            - We are particularly interested in facts related to the following properties: ${relevantProperties.map((property) => property.title).join(", ")}. You must include facts about these properties if they are present in the text.
`),
      },
    ],
  };
};

const retryMax = 3;

export const inferEntityFactsFromTextAgent = async (params: {
  subjectEntities: LocalEntitySummary[];
  potentialObjectEntities: LocalEntitySummary[];
  text: string;
  url: string | null;
  title: string | null;
  dereferencedEntityType: DereferencedEntityType;
  linkEntityTypesById: Record<string, DereferencedEntityType>;
  retryContext?: {
    previousInvalidFacts: Fact[];
    previousValidFacts: Fact[];
    retryMessages: LlmMessage[];
    retryCount: number;
  };
}): Promise<{ facts: Fact[] }> => {
  const {
    subjectEntities,
    potentialObjectEntities,
    text,
    url,
    title,
    dereferencedEntityType,
    linkEntityTypesById,
    retryContext,
  } = params;

  logger.debug(
    `Inferring facts from text for entities ${subjectEntities.map(({ name }) => name).join(", ")}`,
  );

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

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
        taskName: "facts-from-text",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  const retry = (retryParams: {
    allValidInferredFacts: Fact[];
    allInvalidFacts: Fact[];
    retryMessages: LlmMessage[];
  }) => {
    const { allValidInferredFacts, allInvalidFacts, retryMessages } =
      retryParams;

    const { retryCount = 0 } = retryContext ?? {};

    if (retryCount >= retryMax) {
      logger.debug(
        "Exceeded the retry limit for inferring facts from text, returning the previously inferred facts.",
      );
      /**
       * If some of the facts are repeatedly invalid, we handle this gracefully
       * by returning all the valid facts which were parsed.
       */
      return {
        facts: allValidInferredFacts,
      };
    }

    return inferEntityFactsFromTextAgent({
      ...params,
      retryContext: {
        previousInvalidFacts: allInvalidFacts,
        previousValidFacts: allValidInferredFacts,
        retryMessages,
        retryCount: retryCount + 1,
      },
    });
  };

  if (llmResponse.status === "exceeded-maximum-output-tokens") {
    /**
     * @todo: ideally instead of retrying and asking for fewer facts, we would either:
     *  - provide information on which facts are relevant, so that these aren't omitted
     *  - gather facts on smaller chunks of text, so that obtaining all the facts for an
     *    entity doesn't exceed the maximum output token limit
     */
    return retry({
      allInvalidFacts: params.retryContext?.previousInvalidFacts ?? [],
      allValidInferredFacts: params.retryContext?.previousValidFacts ?? [],
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
                You attempted to submit too many facts.
                Try again by submitting fewer facts (less than 40).
              `),
            },
          ],
        },
      ],
    });
  } else if (llmResponse.status !== "ok") {
    return { facts: params.retryContext?.previousValidFacts ?? [] };
  }

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: llmResponse.message,
  });

  const validFacts: Fact[] = [];

  const potentiallyRepeatedInvalidFacts: (Fact & {
    invalidReason: string;
    toolCallId: string;
  })[] = [];

  for (const toolCall of toolCalls) {
    const input = toolCall.input as {
      facts: {
        subjectEntityLocalId: string;
        text: string;
        prepositionalPhrases: string[];
        objectEntityLocalId: string | null;
      }[];
    };

    for (const unfinishedFact of input.facts) {
      const fact = {
        ...unfinishedFact,
        objectEntityLocalId: unfinishedFact.objectEntityLocalId ?? undefined,
        factId: generateUuid(),
      };

      const subjectEntity =
        subjectEntities.find(
          ({ localId }) => localId === fact.subjectEntityLocalId,
        ) ??
        potentialObjectEntities.find(
          ({ localId }) => localId === fact.subjectEntityLocalId,
        );

      if (!subjectEntity) {
        potentiallyRepeatedInvalidFacts.push({
          ...fact,
          invalidReason: `An invalid "subjectEntityLocalId" has been provided: ${fact.subjectEntityLocalId}. All facts must relate to a subject entity – don't submit facts that can't be linked to one. Review the subject entities in the earlier message and only provides facts that begin with one of them.`,
          toolCallId: toolCall.id,
        });

        continue;
      }

      const objectEntity =
        potentialObjectEntities.find(
          ({ localId }) => localId === fact.objectEntityLocalId,
        ) ??
        subjectEntities.find(
          ({ localId }) => localId === fact.objectEntityLocalId,
        );

      if (fact.objectEntityLocalId && !objectEntity) {
        potentiallyRepeatedInvalidFacts.push({
          ...fact,
          invalidReason: `An invalid "objectEntityLocalId" has been provided: ${fact.objectEntityLocalId} – if not null, the objectEntityId must relate to a provided entity. Review the object entities provided and match the objectEntityId to one of them – or if there is no match, provide 'null' for the objectEntityId`,
          toolCallId: toolCall.id,
        });

        continue;
      }

      if (!fact.text.includes(subjectEntity.name)) {
        potentiallyRepeatedInvalidFacts.push({
          ...fact,
          invalidReason: `The fact specifies subjectEntityId "${fact.subjectEntityLocalId}", but that entity's name "${subjectEntity.name}" does not appear in the fact. Facts must start with the name of the subject. If you described the entity slightly different, resubmit the fact beginning with "${subjectEntity.name}" instead, as long as you are sure the fact relates to this same entity. If you don't have an appropriate subject for the fact, don't include the fact. Review the subject entities in my previous message for valid subjects.`,
          toolCallId: toolCall.id,
        });
      } else if (objectEntity && !fact.text.includes(objectEntity.name)) {
        potentiallyRepeatedInvalidFacts.push({
          ...fact,
          invalidReason: `The fact specifies objectEntityId "${fact.objectEntityLocalId}, but that entity's name "${objectEntity.name}" does not appear in the fact. Facts must end with the name of the object of the fact. If you described the entity slightly different, resubmit the fact ending with "${objectEntity.name}" instead. If you don't have an objectEntityId for the object of the fact, pass 'null' for objectEntityId.`,
          toolCallId: toolCall.id,
        });
      } else {
        validFacts.push(fact);
      }
    }
  }

  const allValidInferredFacts = [
    ...validFacts,
    ...(retryContext?.previousValidFacts ?? []).filter(
      /**
       * The LLM may submit the same valid fact across multiple retries attempting to correct invalid facts
       */
      (fact) => !validFacts.some((validFact) => validFact.text === fact.text),
    ),
  ];

  /**
   * Only give the model one chance to correct an invalid fact – if it doesn't, discard the fact.
   */
  const invalidFacts = potentiallyRepeatedInvalidFacts.filter(
    (fact) =>
      !(params.retryContext?.previousInvalidFacts ?? []).find(
        (previousInvalidFact) => previousInvalidFact.text === fact.text,
      ),
  );

  /** @todo: check if there are subject entities for which no facts have been provided */

  if (invalidFacts.length > 0) {
    const toolCallResponses = toolCalls.map<LlmMessageToolResultContent>(
      (toolCall) => {
        const invalidFactsProvidedInToolCall = invalidFacts.filter(
          ({ toolCallId }) => toolCallId === toolCall.id,
        );

        if (invalidFacts.length === 0) {
          return {
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: "There were no invalid facts provided by this tool call.",
          };
        }

        return {
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: dedent(`
            The following facts are invalid:
            ${invalidFactsProvidedInToolCall
              .map(
                (invalidFact) =>
                  dedent`<InvalidFact>
            text: ${invalidFact.text}
            subjectEntityId: ${invalidFact.subjectEntityLocalId}
            objectEntityId: ${invalidFact.objectEntityLocalId}
            prepositionalPhrases: ${stringify(invalidFact.prepositionalPhrases)}
            
            Invalid because: ${invalidFact.invalidReason}
            Please correct this!
            </InvalidFact>`,
              )
              .join("\n\n")}

            You must now make another "submitFacts" tool call, correcting each of the errors identified above.
          `),
          is_error: true,
        };
      },
    );

    logger.debug(
      `Retrying inferring facts from text with the following tool call responses: ${stringify(
        toolCallResponses,
      )}`,
    );

    return retry({
      allInvalidFacts: [
        ...invalidFacts,
        ...(retryContext?.previousInvalidFacts ?? []),
      ],
      allValidInferredFacts,
      retryMessages: [
        llmResponse.message,
        {
          role: "user",
          content: toolCallResponses,
        },
      ],
    });
  }

  return { facts: allValidInferredFacts };
};
