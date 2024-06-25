import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import dedent from "dedent";

import { logger } from "../../../shared/activity-logger";
import type { DereferencedEntityType } from "../../../shared/dereference-entity-type";
import { getFlowContext } from "../../../shared/get-flow-context";
import { getLlmResponse } from "../../../shared/get-llm-response";
import type {
  LlmMessage,
  LlmMessageToolResultContent,
  LlmUserMessage,
} from "../../../shared/get-llm-response/llm-message";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message";
import type { LlmToolDefinition } from "../../../shared/get-llm-response/types";
import { graphApiClient } from "../../../shared/graph-api-client";
import { stringify } from "../../../shared/stringify";
import type { LocalEntitySummary } from "./get-entity-summaries-from-text";
import type { Fact } from "./types";

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
                  - must be concise statements that are true based on the information provided in the text
                  - must be standalone, and not depend on any contextual information to make sense
                  - must not contain any pronouns, and refer to all entities by their provided "name"
                  - must not be lists or contain multiple pieces of information, each piece of information must be expressed as a standalone fact
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
    - Subject Entities: the subject entities of facts that the user is looking for, each of which are of the same type (i.e. have the same properties and outgoing links)
    - Relevant Properties: a list of properties the user is looking for in the text.
    - Relevant Outgoing Links: a definition of the possible outgoing links the user is looking for in the text.
    - Potential Object Entities: a list of other entities mentioned in the text, which may be the object of facts.

  You must provide an exhaustive list of facts about the provided subject entities based on the information provided in the text.
  For example, if you are provided with data from a table where the entity is a row of the table,
    all the information in each cell of the row should be represented in the facts.

  These facts will be later used to construct the entities with the properties and links which the user will specify.
  If any information in the text is relevant for constructing the relevant properties or outgoing links, you must include them as facts.
  
  Each fact should be in the format <subject> <predicate> <object>, where the subject is the singular subject of the fact.
  Example:
  [{ text: "Company X acquired Company Y.", prepositionalPhrases: ["in 2019", "for $10 million"], subjectEntityLocalId: "abc", objectEntityLocalId: "123" }]
  Don't include facts which start with a subject you can't provide an id for.
`);

const constructUserMessage = (params: {
  text: string;
  subjectEntities: LocalEntitySummary[];
  dereferencedEntityType: DereferencedEntityType;
  potentialObjectEntities: LocalEntitySummary[];
}): LlmUserMessage => {
  const {
    text,
    subjectEntities,
    dereferencedEntityType,
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
          Text: ${text}
          Subject Entities: ${JSON.stringify(
            subjectEntities.map(({ localId, name }) => ({ localId, name })),
          )}
          Relevant Properties: ${JSON.stringify(relevantProperties)}
          Relevant Outgoing Links: ${JSON.stringify(
            Object.values(dereferencedEntityType.links ?? {}),
          )}
          Potential Object Entities: ${JSON.stringify(
            potentialObjectEntities.map(({ localId, name, summary }) => ({
              localId,
              name,
              summary,
            })),
          )}
        `),
      },
    ],
  };
};

const retryMax = 3;

export const inferEntityFactsFromText = async (params: {
  subjectEntities: LocalEntitySummary[];
  potentialObjectEntities: LocalEntitySummary[];
  text: string;
  dereferencedEntityType: DereferencedEntityType;
  retryContext?: {
    previousValidFacts: Fact[];
    retryMessages: LlmMessage[];
    retryCount: number;
  };
}): Promise<{ facts: Fact[] }> => {
  const {
    subjectEntities,
    potentialObjectEntities,
    text,
    dereferencedEntityType,
    retryContext,
  } = params;

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
          text: retryContext
            ? "Omitted, as you no longer need to infer new facts."
            : text,
          subjectEntities,
          dereferencedEntityType,
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
    retryMessages: LlmMessage[];
  }) => {
    const { allValidInferredFacts, retryMessages } = retryParams;

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

    return inferEntityFactsFromText({
      ...params,
      retryContext: {
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
    return {
      facts: params.retryContext?.previousValidFacts ?? [],
    };
  }

  const validFacts: Fact[] = [];

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: llmResponse.message,
  });

  const invalidFacts: (Fact & { invalidReason: string; toolCallId: string })[] =
    [];

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
        invalidFacts.push({
          ...fact,
          invalidReason: `An invalid "subjectEntityLocalId" has been provided: ${fact.subjectEntityLocalId}`,
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
        invalidFacts.push({
          ...fact,
          invalidReason: `An invalid "objectEntityLocalId" has been provided: ${fact.objectEntityLocalId}`,
          toolCallId: toolCall.id,
        });

        continue;
      }

      if (!fact.text.startsWith(subjectEntity.name)) {
        invalidFacts.push({
          ...fact,
          invalidReason: `The fact does not start with "${subjectEntity.name}" as the subject of the fact. Facts must have the subject entity as the singular subject.`,
          toolCallId: toolCall.id,
        });
      } else if (
        objectEntity &&
        !fact.text.replace(/\.$/, "").endsWith(objectEntity.name)
      ) {
        invalidFacts.push({
          ...fact,
          invalidReason: `The fact does not end with "${objectEntity.name}" as the object of the fact. Facts must have the object entity as the singular object, and specify any prepositional phrases via the "prepositionalPhrases" argument.`,
          toolCallId: toolCall.id,
        });
      } else {
        validFacts.push(fact);
      }
    }
  }

  const allValidInferredFacts = [
    ...validFacts,
    ...(retryContext?.previousValidFacts ?? []),
  ];

  /** @todo: check if there are subject entities for which no facts have been provided */

  if (invalidFacts.length > 0) {
    const toolCallResponses = toolCalls.map<LlmMessageToolResultContent>(
      (toolCall) => {
        const invalidFactsProvidedInToolCall = invalidFacts.filter(
          ({ toolCallId }) => toolCallId === toolCall.id,
        );

        if (invalidFactsProvidedInToolCall.length === 0) {
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
                  `Fact: ${invalidFact.text}\nInvalid Reason: ${invalidFact.invalidReason}`,
              )
              .join("\n\n")}

            You must make another "submitFacts" tool call, with valid facts.
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
