import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { backOff } from "exponential-backoff";

import type { QueryGenerateInverseArgs, ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import * as Error from "../../error";
import { getOpenAiClient } from "./shared/openai-client";

const generatePrompt = (relationship: string): string => `
You are building the ontology for a knowledge graph. You have a directed relationship between two nodes called "${relationship}".

We're looking for a description of the relationship in the other direction, i.e. if 'X ${relationship} Y', then 'Y [inverse] X'.

Examples:
- "Parent Of" -> "Child Of"
- "Employee Of" -> "Employer Of"
- "Owner Of" -> "Owned By"
- "Succeeded At" -> "Was Success Of"
- "Majored In" -> "Was Majored In By"

Please provide a name for the inverse relationship, without quotation marks. Do not provide any other information – your response will be fed directly into the system you're building.

We're NOT looking for a description of the opposite concept.

For example,
The inverse of "Succeeded At" could be "Was Success Of", because if 'X succeeded at Y', then 'Y was a success of X'.
It's NOT "Failed At", which does not describe the relationship in the opposite direction, but instead the opposite concept.

Pay attention to the tense of the relationship. The tense of the inverse should match the tense of the original.
For example, if someone 'Majored In' something the inverse is 'Was Majored In By', but if someone 'Majors In' something the inverse could be 'Majored In By'
– they are still majoring in that thing.

Match the words in the original as much as possible – don't replace key words with synonyms unless necessary.

Given those requirements, what is the inverse of ${relationship}? Or in other words, fill in the blank: 'If X ${relationship} Y, then Y [inverse] X.'

Don't append 'X'!
`;

export const generateInverseResolver: ResolverFn<
  Promise<string>,
  Record<string, never>,
  GraphQLContext,
  QueryGenerateInverseArgs
> = async (_, params, graphQLContext) => {
  if (!graphQLContext.user?.isAccountSignupComplete) {
    throw Error.forbidden("No user found");
  }

  const { relationship } = params;

  const openAiClient = getOpenAiClient();

  try {
    const responseMessage = await backOff(
      async () => {
        const response = await openAiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: generatePrompt(relationship),
            },
          ],
        });

        const message = response.choices[0]?.message.content;

        if (!message) {
          throw Error.internal("Empty response from AI model");
        }

        return message;
      },
      {
        maxDelay: 300,
        numOfAttempts: 3,
      },
    );

    return responseMessage;
  } catch (err) {
    graphQLContext.logger.error(
      `Failed to generate inverse relationship for '${relationship}': ${stringifyError(err)}`,
    );
    throw Error.internal(
      `Failed to generate inverse relationship for ${relationship}`,
    );
  }
};
