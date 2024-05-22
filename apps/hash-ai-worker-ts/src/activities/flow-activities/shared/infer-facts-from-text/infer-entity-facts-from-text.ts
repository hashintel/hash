import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import dedent from "dedent";

import { logger } from "../../../shared/activity-logger";
import type { DereferencedEntityType } from "../../../shared/dereference-entity-type";
import { getFlowContext } from "../../../shared/get-flow-context";
import { getLlmResponse } from "../../../shared/get-llm-response";
import type {
  LlmMessage,
  LlmMessageToolResultContent,
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
  subjectEntity: LocalEntitySummary;
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
              text: {
                type: "string",
                description: dedent(`
                  The text containing the fact, which:
                  - must follow a consistent sentence structure, with a single subject, a single predicate and a single object
                  - must have the "${params.subjectEntity.name}" entity as the singular subject of the fact, so must start with "${params.subjectEntity.name} <predicate> <object>"
                  - must be concise statements that are true based on the information provided in the text
                  - must be standalone, and not depend on any contextual information to make sense
                  - must not contain any pronouns, and refer to all entities by their provided "name"
                  - must not be lists or contain multiple pieces of information, each piece of information must be expressed as a standalone fact
                  - must not contain conjunctions or compound sentences, and therefore must not contain "and", "or", "but" or a comma (",")
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
            required: ["text", "objectEntityLocalId", "prepositionalPhrases"],
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
    - "text": the text from which you should extract facts.
    - "subjectEntity": the entity the facts must have a their subject.
    - "entityType": a definition of the entity type of the subject entity, which includes the properties and outgoing links of the entity.
    - "potentialObjectEntities": a list of other entities mentioned in the text, which may be the object of facts.

  You must provide an exhaustive list of facts about the entity based on the information provided in the text.
  For example, if you are provided with data from a table where the entity is a row of the table,
    all the information in each cell of the row should be represented in the facts.

  These facts will be later used to construct the entity with the properties and links of the entity type.
  If any information in the text is relevant for constructing the properties or outgoing links, you must include them as facts.
`);

const retryMax = 3;

export const inferEntityFactsFromText = async (params: {
  subjectEntity: LocalEntitySummary;
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
    subjectEntity,
    potentialObjectEntities,
    text,
    dereferencedEntityType,
    retryContext,
  } = params;

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      model: "gpt-4o-2024-05-13",
      tools: Object.values(generateToolDefinitions({ subjectEntity })),
      toolChoice: toolNames[0],
      systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                text: ${retryContext ? "Omitted, as you no longer need to infer new facts." : text}
                subjectEntity: ${JSON.stringify({ localId: subjectEntity.localId, name: subjectEntity.name })}
                entityType: ${JSON.stringify(dereferencedEntityType)}
                potentialObjectEntities: ${JSON.stringify(potentialObjectEntities.map(({ localId, name }) => ({ localId, name })))}
              `),
            },
          ],
        },
        ...(retryContext?.retryMessages ?? []),
      ],
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

  const validFacts: Fact[] = [];

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: llmResponse.message,
  });

  const invalidFacts: (Fact & { invalidReason: string; toolCallId: string })[] =
    [];

  for (const toolCall of toolCalls) {
    const input = toolCall.input as {
      facts: {
        text: string;
        prepositionalPhrases: string[];
        objectEntityLocalId: string | null;
      }[];
    };

    const newFacts: Fact[] = input.facts.map((fact) => ({
      factId: generateUuid(),
      text: fact.text,
      subjectEntityLocalId: subjectEntity.localId,
      objectEntityLocalId: fact.objectEntityLocalId ?? undefined,
      prepositionalPhrases: fact.prepositionalPhrases,
    }));

    for (const fact of newFacts) {
      const objectEntity = potentialObjectEntities.find(
        ({ localId }) => localId === fact.objectEntityLocalId,
      );

      /** @todo: ensure the provided `objectEntityLocalId` matches an ID in `potentialObjectEntities` */

      if (fact.text.includes(" and ")) {
        /**
         * @todo: this can result in false positives, names may include the word "and"
         */
        invalidFacts.push({
          ...fact,
          invalidReason: `The fact contains the forbidden word "and". Facts must be standalone and not contain conjunctions. You must split this fact into separate standalone facts.`,
          toolCallId: toolCall.id,
        });
      } else if (!fact.text.startsWith(subjectEntity.name)) {
        invalidFacts.push({
          ...fact,
          invalidReason: `The fact does not start with "${subjectEntity.name}" as the subject of the fact. Facts must have the subject entity as the singular subject.`,
          toolCallId: toolCall.id,
        });
      } else if (objectEntity && !fact.text.endsWith(objectEntity.name)) {
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

  if (invalidFacts.length > 0) {
    const { retryCount = 0 } = retryContext ?? {};

    if (retryCount >= retryMax) {
      logger.debug(
        `Exceeded the retry limit for inferring facts from text, abandoning the following invalid facts: ${stringify(invalidFacts)}`,
      );
      /**
       * If some of the facts are repeatedly invalid, we handle this gracefully
       * by returning all the valid facts which were parsed.
       */
      return {
        facts: allValidInferredFacts,
      };
    }

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
      `Retrying inferring facts from text with the following tool call responses: ${stringify(toolCallResponses)}`,
    );

    return inferEntityFactsFromText({
      ...params,
      retryContext: {
        previousValidFacts: allValidInferredFacts,
        retryMessages: [
          llmResponse.message,
          {
            role: "user",
            content: toolCallResponses,
          },
        ],
        retryCount: retryCount + 1,
      },
    });
  }

  return { facts: allValidInferredFacts };
};
